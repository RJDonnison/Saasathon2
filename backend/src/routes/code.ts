import { Router } from 'express';
import { moduleInClassroom } from '../access.js';
import { PISTON_API_URL, PISTON_AUTH_TOKEN } from '../config.js';
import { supabase } from '../supabase.js';
import { unwrap, type ExerciseRow, type SectionRow } from '../rows.js';
import type { RunCodeRequest, RunCodeResponse } from '../../../shared/types.js';

export const codeRouter = Router();

const MAX_CODE_LENGTH = 25_000;
const MAX_HIDDEN_CODE_LENGTH = 25_000;
const REQUEST_TIMEOUT_MS = 10_000;
const RUN_TIMEOUT_MS = 3_000;
const MAX_RUNS_PER_MINUTE = 12;
const RUN_WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

const runtimes: Record<string, { pistonLanguage: string; filename: string }> = {
  javascript: { pistonLanguage: 'javascript', filename: 'main.js' },
  typescript: { pistonLanguage: 'typescript', filename: 'main.ts' },
  python: { pistonLanguage: 'python', filename: 'main.py' },
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

function allowRun(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((time) => now - time < RUN_WINDOW_MS);
  if (recent.length >= MAX_RUNS_PER_MINUTE) return false;
  recent.push(now);
  hits.set(userId, recent);
  return true;
}

function stageText(stage: PistonStage | undefined, key: 'stdout' | 'stderr'): string {
  return typeof stage?.[key] === 'string' ? stage[key] : '';
}

/** Loads an exercise only when it belongs to the caller's current classroom. Hidden code never leaves this route. */
async function exerciseInClassroom(
  exerciseId: string,
  classroomId: string,
  isStudent: boolean,
): Promise<ExerciseRow | null> {
  const exercise = unwrap(
    await supabase
      .from('code_exercises')
      .select('*')
      .eq('id', exerciseId)
      .maybeSingle(),
  ) as ExerciseRow | null;
  if (!exercise) return null;
  const question = unwrap(
    await supabase
      .from('questions')
      .select('section_id')
      .eq('id', exercise.question_id)
      .maybeSingle(),
  ) as { section_id: string } | null;
  if (!question) return null;
  const section = unwrap(
    await supabase
      .from('sections')
      .select('*')
      .eq('id', question.section_id)
      .maybeSingle(),
  ) as SectionRow | null;
  if (!section) return null;
  const module = await moduleInClassroom(section.module_id, classroomId);
  return module && (!isStudent || module.status === 'published') ? exercise : null;
}

// Code runs only in Piston. The browser talks to this route so its Supabase identity can be
// checked and a Piston credential (if the selected instance requires one) stays private.
codeRouter.post('/run', async (req, res) => {
  const { code, language, exerciseId } = (req.body ?? {}) as Partial<RunCodeRequest>;
  if (
    typeof code !== 'string' ||
    typeof language !== 'string' ||
    (exerciseId !== undefined && (typeof exerciseId !== 'string' || !exerciseId))
  ) {
    res.status(400).json({ error: 'code and language are required' });
    return;
  }
  if (code.length > MAX_CODE_LENGTH) {
    res.status(400).json({ error: `Code must be ${MAX_CODE_LENGTH.toLocaleString()} characters or fewer` });
    return;
  }

  const runtime = runtimes[language.toLowerCase()];
  if (!runtime) {
    res.status(400).json({ error: 'This lesson language is not available to run yet' });
    return;
  }
  let program = code;
  if (exerciseId) {
    const exercise = await exerciseInClassroom(
      exerciseId,
      req.user!.classroomId,
      req.user!.role === 'student',
    );
    if (!exercise) {
      res.status(404).json({ error: 'Code exercise not found' });
      return;
    }
    if (exercise.language.toLowerCase() !== language.toLowerCase()) {
      res.status(400).json({ error: 'Use the language selected for this exercise' });
      return;
    }
    if (exercise.hidden_code.length > MAX_HIDDEN_CODE_LENGTH) {
      res.status(400).json({ error: 'This exercise has too much hidden test code to run' });
      return;
    }
    // This is deliberately assembled after authentication and classroom ownership checks. The client
    // submits only its solution; the teacher's harness is never sent in lesson JSON or API responses.
    program = `${code}\n\n${exercise.hidden_code}`;
  }
  if (!allowRun(req.user!.userId)) {
    res.status(429).json({ error: 'Too many code runs. Please wait a minute and try again.' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (PISTON_AUTH_TOKEN) headers.Authorization = `Bearer ${PISTON_AUTH_TOKEN}`;
    const response = await fetch(`${PISTON_API_URL}/execute`, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        language: runtime.pistonLanguage,
        version: '*',
        files: [{ name: runtime.filename, content: program }],
        run_timeout: RUN_TIMEOUT_MS,
        run_cpu_time: RUN_TIMEOUT_MS,
        run_memory_limit: 128_000_000,
      }),
    });
    const payload = (await response.json().catch(() => null)) as PistonResponse | { message?: string } | null;
    if (!response.ok) {
      const message = payload && 'message' in payload && typeof payload.message === 'string' ? payload.message : null;
      res.status(response.status === 400 ? 400 : 502).json({ error: message ?? 'Code execution service is unavailable' });
      return;
    }

    const piston = payload as PistonResponse;
    const primary = piston.run ?? piston.compile;
    if (!primary) {
      res.status(502).json({ error: 'Code execution service returned an invalid response' });
      return;
    }
    const signal = primary.signal ? `Execution stopped (${primary.signal}).` : '';
    const body: RunCodeResponse = {
      stdout: [stageText(piston.compile, 'stdout'), stageText(piston.run, 'stdout')].filter(Boolean).join(''),
      stderr: [stageText(piston.compile, 'stderr'), stageText(piston.run, 'stderr'), signal].filter(Boolean).join('\n'),
      exitCode: primary.code ?? -1,
    };
    res.json(body);
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'AbortError';
    res.status(502).json({ error: timedOut ? 'Code execution timed out. Please try again.' : 'Code execution service is unavailable' });
  } finally {
    clearTimeout(timeout);
  }
});
