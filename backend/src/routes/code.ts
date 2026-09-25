import { Router } from 'express';
import type { RunCodeRequest, RunCodeResponse } from '../../../shared/types.js';

export const codeRouter = Router();

// MOCKED: no code is ever executed. Real sandboxed execution is follow-up feature work.
codeRouter.post('/run', async (req, res) => {
  const { code, language } = (req.body ?? {}) as Partial<RunCodeRequest>;
  if (typeof code !== 'string' || typeof language !== 'string') {
    res.status(400).json({ error: 'code and language are required' });
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, 300)); // fake execution latency
  const body: RunCodeResponse = { stdout: 'mock output for: ' + code, stderr: '', exitCode: 0 };
  res.json(body);
});
