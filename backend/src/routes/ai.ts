import { Router, type RequestHandler, type Response } from "express";
import { moduleInClassroom } from "../access.js";
import type { ModuleRow } from "../rows.js";
import { requireRole } from "../auth.js";
import {
  AiNotConfiguredError,
  complete,
  isAiConfigured,
  type ChatTurn,
} from "../openai.js";
import {
  draftSystemPrompt,
  hintSystemPrompt,
  studentModuleContext,
  teacherModuleContext,
} from "../ai/prompts.js";
import { aggregate } from "./modules.js";
import type {
  AiDraftRequest,
  AiDraftResponse,
  AiHintRequest,
  AiHintResponse,
} from "../../../shared/types.js";

// Both endpoints are stateless: the module is loaded server-side (scoped to the caller's classroom),
// the client re-sends the chat history, and nothing is stored. Mounted behind requireMember.
export const aiRouter = Router();

const MAX_QUESTION = 2000;
const MAX_TURN_TEXT = 2000;
const MAX_HISTORY_TURNS = 20;
const MAX_CODE = 8000;
const MAX_DRAFT_REQUEST = 4000;
const MAX_DRAFT = 20000;

// Protects the OpenAI bill: a small per-user sliding window (in-memory, per server process).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const hits = new Map<string, number[]>();
const rateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const recent = (hits.get(req.user!.userId) ?? []).filter(
    (t) => now - t < RATE_WINDOW_MS,
  );
  if (recent.length >= RATE_MAX) {
    res.status(429).json({
      error: "Too many AI requests. Please wait a minute and try again.",
    });
    return;
  }
  recent.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(req.user!.userId, recent);
  next();
};

// Loading a module is several sequential DB queries (~1s), so the student-safe context is cached briefly.
// Only the *text* is cached; the caller's classroom check still runs on every request. Teacher drafting
// is deliberately uncached so edits show up immediately.
const CONTEXT_TTL_MS = 60_000;
const contextCache = new Map<string, { text: string; expires: number }>();
async function studentContextFor(row: ModuleRow): Promise<string> {
  const hit = contextCache.get(row.id);
  if (hit && hit.expires > Date.now()) return hit.text;
  // teacher=false: the aggregate is loaded WITHOUT answer keys, reference answers or checks.
  const text = studentModuleContext(await aggregate(row, false));
  if (contextCache.size > 200) contextCache.clear();
  contextCache.set(row.id, { text, expires: Date.now() + CONTEXT_TTL_MS });
  return text;
}

/** undefined -> []; malformed -> null. Keeps only the most recent turns and trims each. */
function parseHistory(raw: unknown): ChatTurn[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const turns: ChatTurn[] = [];
  for (const m of raw.slice(-MAX_HISTORY_TURNS)) {
    if (
      !m ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.text !== "string"
    )
      return null;
    turns.push({ role: m.role, text: m.text.slice(0, MAX_TURN_TEXT) });
  }
  return turns;
}

/** Runs the completion and maps failures to clean JSON errors (never leaks OpenAI's error text or status). */
async function reply(res: Response, run: () => Promise<string>): Promise<void> {
  try {
    const body: AiHintResponse | AiDraftResponse = { reply: await run() };
    res.json(body);
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    console.error(
      "[ai] completion failed:",
      err instanceof Error ? err.message : err,
    );
    res.status(502).json({
      error: "The AI service is unavailable right now. Please try again.",
    });
  }
}

const notConfigured = (res: Response) =>
  res.status(503).json({ error: new AiNotConfiguredError().message });

aiRouter.post("/hint", requireRole("student"), rateLimit, async (req, res) => {
  const { moduleId, studentId, question, code } = (req.body ??
    {}) as Partial<AiHintRequest>;
  const history = parseHistory(req.body?.history);
  if (
    typeof moduleId !== "string" ||
    typeof studentId !== "string" ||
    typeof question !== "string" ||
    !question.trim() ||
    question.length > MAX_QUESTION ||
    !history ||
    (code !== undefined && (typeof code !== "string" || code.length > MAX_CODE))
  ) {
    res.status(400).json({
      error: `moduleId, studentId and a question (max ${MAX_QUESTION} chars) are required; history and code must be well-formed`,
    });
    return;
  }
  if (studentId !== req.user!.userId) {
    res.status(403).json({ error: "You can only ask for hints as yourself" });
    return;
  }
  if (!isAiConfigured()) return notConfigured(res);

  const row = await moduleInClassroom(moduleId, req.user!.classroomId);
  if (!row) {
    res.status(404).json({ error: "Module not found" });
    return;
  }
  const context = await studentContextFor(row);

  const message = code?.trim()
    ? `${question.trim()}\n\nMy current code:\n\`\`\`\n${code}\n\`\`\``
    : question.trim();
  await reply(res, () =>
    complete({
      system: hintSystemPrompt(context),
      history,
      message,
      maxTokens: 400, // hints are short by design
    }),
  );
});

// Stretch: teacher-facing drafting/planning assistant.
aiRouter.post("/draft", requireRole("teacher"), rateLimit, async (req, res) => {
  const { request, moduleId, draft } = (req.body ??
    {}) as Partial<AiDraftRequest>;
  const history = parseHistory(req.body?.history);
  if (
    typeof request !== "string" ||
    !request.trim() ||
    request.length > MAX_DRAFT_REQUEST ||
    !history ||
    (moduleId !== undefined && typeof moduleId !== "string") ||
    (draft !== undefined &&
      (typeof draft !== "string" || draft.length > MAX_DRAFT))
  ) {
    res.status(400).json({
      error: `A request (max ${MAX_DRAFT_REQUEST} chars) is required; moduleId, draft and history must be well-formed`,
    });
    return;
  }
  if (!isAiConfigured()) return notConfigured(res);

  let moduleContext: string | null = null;
  if (moduleId) {
    const row = await moduleInClassroom(moduleId, req.user!.classroomId);
    if (!row) {
      res.status(404).json({ error: "Module not found" });
      return;
    }
    moduleContext = teacherModuleContext(await aggregate(row, true));
  }

  await reply(res, () =>
    complete({
      system: draftSystemPrompt(moduleContext, draft?.trim() || null),
      history,
      message: request.trim(),
      maxTokens: 1500,
    }),
  );
});
