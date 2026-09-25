import { Router } from 'express';
import { PISTON_BASE_URL } from '../config.js';
import type { RunCodeRequest, RunCodeResponse } from '../../../shared/types.js';

export const codeRouter = Router();

const PISTON_LANGUAGES: Record<string, string> = {
  javascript: 'javascript',
  typescript: 'typescript',
  python: 'python',
  java: 'java',
  c: 'c',
  cpp: 'c++',
};

interface PistonStage {
  stdout?: string;
  stderr?: string;
  code?: number | null;
}

interface PistonExecuteResponse {
  run?: PistonStage;
  compile?: PistonStage;
  message?: string;
}

const MAX_CODE_BYTES = 100_000;
const PISTON_REQUEST_TIMEOUT_MS = 12_000;

codeRouter.post('/run', async (req, res) => {
  const { code, language } = (req.body ?? {}) as Partial<RunCodeRequest>;
  if (typeof code !== 'string' || typeof language !== 'string') {
    res.status(400).json({ error: 'code and language are required' });
    return;
  }

  if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
    res.status(413).json({ error: 'code must be 100 KB or smaller' });
    return;
  }

  const pistonLanguage = PISTON_LANGUAGES[language];
  if (!pistonLanguage) {
    res.status(400).json({ error: `Unsupported language: ${language}` });
    return;
  }

  if (!PISTON_BASE_URL) {
    res.status(503).json({ error: 'Code execution is not configured' });
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PISTON_REQUEST_TIMEOUT_MS);

  try {
    const pistonResponse = await fetch(`${PISTON_BASE_URL}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        language: pistonLanguage,
        version: '*',
        files: [{ content: code }],
        compile_timeout: 10_000,
        run_timeout: 3_000,
        compile_cpu_time: 10_000,
        run_cpu_time: 3_000,
        compile_memory_limit: 256 * 1024 * 1024,
        run_memory_limit: 128 * 1024 * 1024,
      }),
    });

    const payload = (await pistonResponse.json().catch(() => null)) as PistonExecuteResponse | null;
    if (!pistonResponse.ok || !payload) {
      res.status(502).json({
        error: payload?.message ?? 'Code execution service rejected the request',
      });
      return;
    }

    const compile = payload.compile;
    const run = payload.run;
    const body: RunCodeResponse = {
      stdout: [compile?.stdout, run?.stdout].filter((value): value is string => Boolean(value)).join(''),
      stderr: [compile?.stderr, run?.stderr].filter((value): value is string => Boolean(value)).join(''),
      exitCode: run?.code ?? compile?.code ?? 1,
    };
    res.json(body);
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Code execution timed out'
      : 'Code execution service is unavailable';
    res.status(502).json({ error: message });
  } finally {
    clearTimeout(timeout);
  }
});
