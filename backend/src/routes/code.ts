import { randomUUID } from "node:crypto";
import { Router } from "express";
import { moduleInClassroom } from "../access.js";
import { supabase } from "../supabase.js";
import {
  unwrap,
  type CheckRow,
  type ExerciseRow,
  type QuestionRow,
  type SectionRow,
} from "../rows.js";
import type {
  CheckResult,
  RunChecksResponse,
  SubmitCheckResult,
  SubmitChecksRequest,
} from "../../../shared/types.js";

export const codeRouter = Router();

const MAX_CODE_BYTES = 100_000;
const MAX_OUTPUT_BYTES = 400_000;
const MAX_MESSAGE_CHARS = 500;

/**
 * POST /api/code/check records the outcome of an in-browser run. Student code (and its checks)
 * execute client-side in a Web Worker; this route only validates the submitted results against
 * the exercise's own checks, rebuilds authoritative results in DB order and inserts the
 * code_submissions row.
 */
codeRouter.post("/check", async (req, res) => {
  const { codeExerciseId, code, results, stdout, stderr } = (req.body ??
    {}) as Partial<SubmitChecksRequest>;
  if (typeof codeExerciseId !== "string" || typeof code !== "string") {
    res.status(400).json({ error: "codeExerciseId and code are required" });
    return;
  }
  if (Buffer.byteLength(code, "utf8") > MAX_CODE_BYTES) {
    res.status(413).json({ error: "code must be 100 KB or smaller" });
    return;
  }
  if (typeof stdout !== "string" || typeof stderr !== "string") {
    res.status(400).json({ error: "stdout and stderr are required" });
    return;
  }
  if (
    Buffer.byteLength(stdout, "utf8") > MAX_OUTPUT_BYTES ||
    Buffer.byteLength(stderr, "utf8") > MAX_OUTPUT_BYTES
  ) {
    res.status(413).json({
      error: "stdout and stderr must be 400 KB or smaller",
    });
    return;
  }
  if (
    !Array.isArray(results) ||
    results.length === 0 ||
    results.some(
      (r) =>
        typeof r?.checkId !== "string" ||
        typeof r.passed !== "boolean" ||
        (r.message !== null &&
          (typeof r.message !== "string" ||
            r.message.length > MAX_MESSAGE_CHARS)),
    )
  ) {
    res.status(400).json({
      error: "results must be a non-empty array of {checkId, passed, message}",
    });
    return;
  }
  const submitted = results as SubmitCheckResult[];

  // Ownership: exercise -> question -> section -> module must live in the caller's classroom.
  const exercise = unwrap(
    await supabase
      .from("code_exercises")
      .select("*")
      .eq("id", codeExerciseId)
      .maybeSingle(),
  ) as ExerciseRow | null;
  if (!exercise) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }
  const question = unwrap(
    await supabase
      .from("questions")
      .select("*")
      .eq("id", exercise.question_id)
      .maybeSingle(),
  ) as QuestionRow | null;
  const section = question
    ? (unwrap(
        await supabase
          .from("sections")
          .select("*")
          .eq("id", question.section_id)
          .maybeSingle(),
      ) as SectionRow | null)
    : null;
  if (
    !section ||
    !(await moduleInClassroom(section.module_id, req.user!.classroomId))
  ) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }

  if (
    exercise.language !== "javascript" &&
    exercise.language !== "typescript"
  ) {
    res.status(400).json({
      error: "Only JavaScript and TypeScript exercises can be checked",
    });
    return;
  }

  const checks = unwrap(
    await supabase
      .from("code_checks")
      .select("*")
      .eq("code_exercise_id", exercise.id)
      .order("position")
      .order("id"),
  ) as CheckRow[];

  // The submitted checkIds must be exactly this exercise's checks (same set, no dupes).
  const expectedIds = new Set(checks.map((c) => c.id));
  const seen = new Set<string>();
  const matches =
    checks.length > 0 &&
    submitted.length === checks.length &&
    submitted.every((r) => {
      if (!expectedIds.has(r.checkId) || seen.has(r.checkId)) return false;
      seen.add(r.checkId);
      return true;
    });
  if (!matches) {
    res.status(400).json({
      error: "Submitted results do not match this exercise's checks",
    });
    return;
  }

  const byCheckId = new Map(submitted.map((r) => [r.checkId, r]));
  const outcomes: CheckResult[] = checks.map((check) => ({
    checkId: check.id,
    name: check.name,
    description: check.description,
    passed: byCheckId.get(check.id)!.passed,
    message: byCheckId.get(check.id)!.message,
  }));
  const passed = outcomes.every((o) => o.passed);

  const submissionId = (
    unwrap(
      await supabase
        .from("code_submissions")
        .insert({
          id: randomUUID(),
          student_id: req.user!.userId,
          code_exercise_id: exercise.id,
          code,
          stdout,
          stderr,
          passed,
        })
        .select("id")
        .single(),
    ) as { id: string }
  ).id;
  const body: RunChecksResponse = {
    passed,
    results: outcomes,
    stdout,
    stderr,
    submissionId,
  };
  res.json(body);
});
