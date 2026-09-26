import { randomUUID } from "node:crypto";
import { Router } from "express";
import { moduleForUser } from "../access.js";
import { PISTON_API_URL, PISTON_AUTH_TOKEN } from "../config.js";
import type {
  GradeCodeExerciseRequest,
  GradeCodeExerciseResponse,
  GradeCodeTestResult,
  RunCodeRequest,
  RunCodeResponse,
} from "../../../shared/types.js";
import { requireRole } from "../auth.js";
import { supabase } from "../supabase.js";
import { liveModuleStudentAggregate } from "../questionOutcomes.js";
import { emitLiveModuleAggregateUpdate } from "../sockets.js";
import {
  unwrap,
  type ExerciseRow,
  type TestRow,
} from "../rows.js";

export const codeRouter = Router();

async function persistGrade(
  exercise: ExerciseRow,
  studentId: string,
  classroomId: string,
  code: string,
  passed: boolean,
): Promise<void> {
  const checkedAt = new Date().toISOString();
  unwrap(
    await supabase.from("code_submissions").insert({
      id: randomUUID(),
      student_id: studentId,
      code_exercise_id: exercise.id,
      code,
      stdout: "",
      stderr: "",
      passed,
      created_at: checkedAt,
      graded_at: checkedAt,
    }),
  );
  const question = unwrap(
    await supabase
      .from("questions")
      .select("section_id")
      .eq("id", exercise.question_id)
      .single(),
  ) as { section_id: string };
  const section = unwrap(
    await supabase
      .from("sections")
      .select("module_id")
      .eq("id", question.section_id)
      .single(),
  ) as { module_id: string };
  const aggregate = await liveModuleStudentAggregate(
    section.module_id,
    studentId,
  );
  await emitLiveModuleAggregateUpdate({
    type: "live_module_aggregate_update",
    classroomId,
    moduleId: section.module_id,
    studentId,
    aggregate,
    version: checkedAt,
  });
}

const MAX_CODE_LENGTH = 25_000;
const MAX_HIDDEN_CODE_LENGTH = 25_000;
const REQUEST_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = 3_000;
const MAX_RUNS_PER_MINUTE = 12;
const MAX_GRADES_PER_MINUTE = 6;
const MAX_TESTS_PER_EXERCISE = 20;
const RUN_WINDOW_MS = 60_000;
const runHits = new Map<string, number[]>();
const gradeHits = new Map<string, number[]>();

const runtimes: Record<string, { pistonLanguage: string; filename: string }> = {
  javascript: { pistonLanguage: "javascript", filename: "main.js" },
  typescript: { pistonLanguage: "typescript", filename: "main.ts" },
  python: { pistonLanguage: "python", filename: "main.py" },
};

interface PistonStage {
  stdout?: string;
  stderr?: string;
  code?: number | null;
  signal?: string | null;
  message?: string | null;
}

interface PistonResponse {
  run?: PistonStage;
  compile?: PistonStage;
}

function allow(
  hits: Map<string, number[]>,
  userId: string,
  limit: number,
): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter(
    (time) => now - time < RUN_WINDOW_MS,
  );
  if (recent.length >= limit) return false;
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

function stageText(
  stage: PistonStage | undefined,
  key: "stdout" | "stderr",
): string {
  return typeof stage?.[key] === "string" ? stage[key] : "";
}

/** Loads an exercise only when it belongs to the caller's current classroom. Hidden code never leaves this route. */
async function exerciseInClassroom(
  exerciseId: string,
  classroomId: string,
  role: "student" | "teacher",
): Promise<ExerciseRow | null> {
  // The module id comes along through embedded joins: one query for the exercise instead of three parent lookups.
  const row = unwrap(
    await supabase
      .from("code_exercises")
      .select("*, questions!inner(sections!inner(module_id))")
      .eq("id", exerciseId)
      .maybeSingle(),
  ) as unknown as
    | (ExerciseRow & {
        questions:
          | { sections: { module_id: string } | Array<{ module_id: string }> | null }
          | Array<{ sections: { module_id: string } | Array<{ module_id: string }> | null }>
          | null;
      })
    | null;
  if (!row) return null;
  const { questions, ...exercise } = row;
  const question = Array.isArray(questions) ? questions[0] : questions;
  const section = Array.isArray(question?.sections) ? question.sections[0] : question?.sections;
  if (!section) return null;
  return (await moduleForUser(section.module_id, classroomId, role))
    ? exercise
    : null;
}

// Code runs only in Piston. The browser talks to this route so its Supabase identity can be
// checked and a Piston credential (if the selected instance requires one) stays private.
codeRouter.post("/run", async (req, res) => {
  const { code, language, exerciseId } = (req.body ??
    {}) as Partial<RunCodeRequest>;
  if (
    typeof code !== "string" ||
    typeof language !== "string" ||
    (exerciseId !== undefined &&
      (typeof exerciseId !== "string" || !exerciseId))
  ) {
    res.status(400).json({ error: "code and language are required" });
    return;
  }
  if (code.length > MAX_CODE_LENGTH) {
    res.status(400).json({
      error: `Code must be ${MAX_CODE_LENGTH.toLocaleString()} characters or fewer`,
    });
    return;
  }

  const runtime = runtimes[language.toLowerCase()];
  if (!runtime) {
    res
      .status(400)
      .json({ error: "This lesson language is not available to run yet" });
    return;
  }
  if (!allow(runHits, req.user!.userId, MAX_RUNS_PER_MINUTE)) {
    res.status(429).json({
      error: "Too many code runs. Please wait a minute and try again.",
    });
    return;
  }
  let program = code;
  if (exerciseId) {
    const exercise = await exerciseInClassroom(
      exerciseId,
      req.user!.classroomId,
      req.user!.role,
    );
    if (!exercise) {
      res.status(404).json({ error: "Code exercise not found" });
      return;
    }
    if (exercise.language.toLowerCase() !== language.toLowerCase()) {
      res
        .status(400)
        .json({ error: "Use the language selected for this exercise" });
      return;
    }
    if (exercise.hidden_code.length > MAX_HIDDEN_CODE_LENGTH) {
      res
        .status(400)
        .json({ error: "This exercise has too much hidden test code to run" });
      return;
    }
    // This is deliberately assembled after authentication and classroom ownership checks. The client
    // submits only its solution; the teacher's harness is never sent in lesson JSON or API responses.
    program = `${code}\n\n${exercise.hidden_code}`;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (PISTON_AUTH_TOKEN)
      headers.Authorization = `Bearer ${PISTON_AUTH_TOKEN}`;
    const response = await fetch(`${PISTON_API_URL}/execute`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        language: runtime.pistonLanguage,
        version: "*",
        files: [{ name: runtime.filename, content: program }],
        run_timeout: RUN_TIMEOUT_MS,
        run_cpu_time: RUN_TIMEOUT_MS,
        run_memory_limit: 128_000_000,
      }),
    });
    const payload = (await response.json().catch(() => null)) as
      PistonResponse | { message?: string } | null;
    if (!response.ok) {
      const message =
        payload && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : null;
      res
        .status(response.status === 400 ? 400 : 502)
        .json({ error: message ?? "Code execution service is unavailable" });
      return;
    }

    const piston = payload as PistonResponse;
    const primary = piston.run ?? piston.compile;
    if (!primary) {
      res
        .status(502)
        .json({ error: "Code execution service returned an invalid response" });
      return;
    }
    const signal = primary.signal
      ? `Execution stopped (${primary.signal}).`
      : "";
    const body: RunCodeResponse = {
      stdout: [
        stageText(piston.compile, "stdout"),
        stageText(piston.run, "stdout"),
      ]
        .filter(Boolean)
        .join(""),
      stderr: [
        stageText(piston.compile, "stderr"),
        stageText(piston.run, "stderr"),
        signal,
      ]
        .filter(Boolean)
        .join("\n"),
      exitCode: primary.code ?? -1,
    };
    res.json(body);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "AbortError";
    res.status(502).json({
      error: timedOut
        ? "Code execution timed out. Please try again."
        : "Code execution service is unavailable",
    });
  } finally {
    clearTimeout(timeout);
  }
});

function harness(
  language: string,
  code: string,
  functionName: string,
  tests: TestRow[],
): string | null {
  const cases = JSON.stringify(
    tests.map((test) => ({ args: test.args, expected: test.expected })),
  );
  if (language === "python")
    return `${code}\n\nimport json\n__cases = json.loads(${JSON.stringify(cases)})\ntry:\n    __fn = globals()[${JSON.stringify(functionName)}]\n    if not callable(__fn):\n        raise TypeError()\nexcept (KeyError, TypeError):\n    print('__CLASSROOM_GRADE__' + json.dumps({'functionMissing': True}))\nexcept Exception:\n    print('__CLASSROOM_GRADE__' + json.dumps({'error': True}))\nelse:\n    __results = []\n    __no_return = False\n    __runtime_error = False\n    for __case in __cases:\n        try:\n            __value = __fn(*__case['args'])\n            __no_return = __no_return or (__value is None and __case['expected'] is not None)\n            __results.append(__value == __case['expected'])\n        except Exception:\n            __runtime_error = True\n            __results.append(False)\n    print('__CLASSROOM_GRADE__' + json.dumps({'results': __results, 'noReturn': __no_return, 'runtimeError': __runtime_error}))\n`;
  if (language === "javascript" || language === "typescript")
    return `${code}\n\nconst __cases = ${cases};\nlet __fn;\ntry { __fn = eval(${JSON.stringify(functionName)}); } catch (_) { console.log('__CLASSROOM_GRADE__' + JSON.stringify({ functionMissing: true })); }\nif (typeof __fn === 'function') {\n  const __same = (a, b) => a === b || (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b) && (Array.isArray(a) ? a.length === b.length && a.every((x, i) => __same(x, b[i])) : Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => Object.prototype.hasOwnProperty.call(b, k) && __same(a[k], b[k]))));\n  let __noReturn = false;\n  let __runtimeError = false;\n  const __results = __cases.map((test) => { try { const value = __fn(...test.args); __noReturn ||= value === undefined; return __same(value, test.expected); } catch (_) { __runtimeError = true; return false; } });\n  console.log('__CLASSROOM_GRADE__' + JSON.stringify({ results: __results, noReturn: __noReturn, runtimeError: __runtimeError }));\n} else if (__fn !== undefined) { console.log('__CLASSROOM_GRADE__' + JSON.stringify({ functionMissing: true })); }\n`;
  return null;
}

codeRouter.post("/grade", requireRole("student"), async (req, res) => {
  const { exerciseId, code } = (req.body ??
    {}) as Partial<GradeCodeExerciseRequest>;
  if (
    typeof exerciseId !== "string" ||
    typeof code !== "string" ||
    code.length > MAX_CODE_LENGTH
  ) {
    res.status(400).json({ error: "Invalid exercise grading request" });
    return;
  }
  if (!allow(gradeHits, req.user!.userId, MAX_GRADES_PER_MINUTE)) {
    res.status(429).json({
      error: "Too many grading requests. Please wait a minute and try again.",
    });
    return;
  }
  const exercise = await exerciseInClassroom(
    exerciseId,
    req.user!.classroomId,
    req.user!.role,
  );
  if (!exercise) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }
  const runtime = runtimes[exercise.language.toLowerCase()];
  const tests = unwrap(
    await supabase
      .from("code_tests")
      .select("*")
      .eq("code_exercise_id", exercise.id)
      .order("position")
      .order("id"),
  ) as TestRow[];
  if (
    !runtime ||
    !exercise.function_name ||
    !tests.length ||
    tests.length > MAX_TESTS_PER_EXERCISE
  ) {
    await persistGrade(
      exercise,
      req.user!.userId,
      req.user!.classroomId,
      code,
      false,
    );
    res.json({
      passed: false,
      error: "Automated checks are not configured for this exercise.",
    } satisfies GradeCodeExerciseResponse);
    return;
  }
  const source = harness(
    exercise.language.toLowerCase(),
    code,
    exercise.function_name,
    tests,
  );
  if (!source) {
    await persistGrade(
      exercise,
      req.user!.userId,
      req.user!.classroomId,
      code,
      false,
    );
    res.json({
      passed: false,
      error: "Automated checks are not available for this exercise.",
    } satisfies GradeCodeExerciseResponse);
    return;
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (PISTON_AUTH_TOKEN)
      headers.Authorization = `Bearer ${PISTON_AUTH_TOKEN}`;
    const response = await fetch(`${PISTON_API_URL}/execute`, {
      method: "POST",
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        language: runtime.pistonLanguage,
        version: "*",
        files: [{ name: runtime.filename, content: source }],
        run_timeout: RUN_TIMEOUT_MS,
        run_cpu_time: RUN_TIMEOUT_MS,
        run_memory_limit: 128_000_000,
      }),
    });
    const payload = (await response
      .json()
      .catch(() => null)) as PistonResponse | null;
    const output = [
      stageText(payload?.compile, "stdout"),
      stageText(payload?.run, "stdout"),
    ].join("");
    const marker = output
      .split("\n")
      .reverse()
      .find((line) => line.startsWith("__CLASSROOM_GRADE__"));
    let result: {
      results?: unknown;
      error?: unknown;
      functionMissing?: unknown;
      noReturn?: unknown;
      runtimeError?: unknown;
    } | null = null;
    try {
      result = marker
        ? JSON.parse(marker.slice("__CLASSROOM_GRADE__".length))
        : null;
    } catch {}
    const resultValues = result?.results;
    if (
      !response.ok ||
      !result ||
      result.error ||
      result.functionMissing === true ||
      !Array.isArray(resultValues) ||
      resultValues.length !== tests.length ||
      !resultValues.every((passed) => typeof passed === "boolean")
    ) {
      await persistGrade(
        exercise,
        req.user!.userId,
        req.user!.classroomId,
        code,
        false,
      );
      res.json({
        passed: false,
        error:
          result?.functionMissing === true
            ? `We could not find a function named ${exercise.function_name}. Check its name and declaration.`
            : "Your code could not be checked. Fix any syntax errors and try again.",
      } satisfies GradeCodeExerciseResponse);
    } else {
      const results: GradeCodeTestResult[] = tests.map((test, index) => ({
        name: test.name,
        passed: resultValues[index] as boolean,
      }));
      const passed = results.every((test) => test.passed);
      await persistGrade(
        exercise,
        req.user!.userId,
        req.user!.classroomId,
        code,
        passed,
      );
      res.json({
        passed,
        results,
        ...(result.noReturn === true
          ? {
              error:
                "Your function did not return a value for at least one check. Return the result instead of only printing it.",
            }
          : result.runtimeError === true
            ? {
                error:
                  "Your function ran into an error during a check. Look for incomplete branches or invalid values.",
              }
            : {}),
      } satisfies GradeCodeExerciseResponse);
    }
  } catch {
    await persistGrade(
      exercise,
      req.user!.userId,
      req.user!.classroomId,
      code,
      false,
    );
    res.json({
      passed: false,
      error: "Your code could not be checked. Please try again.",
    } satisfies GradeCodeExerciseResponse);
  } finally {
    clearTimeout(timeout);
  }
});
