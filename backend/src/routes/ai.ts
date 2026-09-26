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
  AiCodeHighlight,
  AiDraftRequest,
  AiDraftResponse,
  AiHintRequest,
  AiHintResponse,
  StudentModule,
  TeacherModule,
} from "../../../shared/types.js";

// Both endpoints are stateless: the module is loaded server-side (scoped to the caller's classroom),
// the client re-sends the chat history, and nothing is stored. Mounted behind requireMember.
export const aiRouter = Router();

const MAX_QUESTION = 2000;
const MAX_TURN_TEXT = 2000;
const MAX_HISTORY_TURNS = 20;
const MAX_CODE = 8000;
const MAX_RUN_ERROR = 2000;
const MAX_NOTE = 200;
const MAX_DRAFT_REQUEST = 4000;
const MAX_DRAFT = 20000;

// Protects the OpenAI bill: a small per-user sliding window (in-memory, per server process).
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
const hits = new Map<string, number[]>();
const rateLimit: RequestHandler = (req, res, next) => {
  const now = Date.now();
  const recent = (hits.get(req.user!.userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX) {
    res.status(429).json({ error: "Too many AI requests. Please wait a minute and try again." });
    return;
  }
  recent.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(req.user!.userId, recent);
  next();
};

// Loading a module is several sequential DB queries (~1s), so the student-safe view is cached briefly.
// Only that view (no answer keys, reference answers or checks) is cached; the caller's classroom check
// still runs on every request. Teacher drafting is deliberately uncached so edits show up immediately.
const CONTEXT_TTL_MS = 60_000;
const contextCache = new Map<string, { text: string; module: StudentModule; expires: number }>();
async function studentViewFor(row: ModuleRow): Promise<{ text: string; module: StudentModule }> {
  const hit = contextCache.get(row.id);
  if (hit && hit.expires > Date.now()) return hit;
  // teacher=false: the aggregate is loaded WITHOUT answer keys, reference answers or checks.
  const module = (await aggregate(row, false)) as StudentModule;
  const entry = { text: studentModuleContext(module), module, expires: Date.now() + CONTEXT_TTL_MS };
  if (contextCache.size > 200) contextCache.clear();
  contextCache.set(row.id, entry);
  return entry;
}

/** The prompt + starter task of one code exercise, from the student-safe view only. */
function exerciseNote(module: StudentModule, exerciseId: string): string | null {
  for (const s of module.sections) {
    for (const q of s.questions) {
      if (q.codeExercise?.id === exerciseId) {
        return `${q.prompt}\n${q.codeExercise.instructions}`.trim();
      }
    }
  }
  return null;
}

/** Lines shown to the model as "12| code" so it can cite them; the editor uses the same 1-based numbers. */
const numbered = (code: string) =>
  code
    .split("\n")
    .map((l, i) => `${i + 1}| ${l}`)
    .join("\n");

/**
 * Parses the model's JSON reply. The highlight is only trusted if it lands inside the submitted code;
 * anything malformed degrades to a plain reply rather than an error.
 */
function parseLocated(raw: string, lineCount: number): AiHintResponse {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { reply: raw };
  }
  const obj = (data && typeof data === "object" ? data : {}) as { reply?: unknown; highlight?: unknown };
  const text = typeof obj.reply === "string" && obj.reply.trim() ? obj.reply.trim() : raw;
  const h = obj.highlight as Partial<AiCodeHighlight> | null | undefined;
  if (!h || typeof h !== "object" || !Number.isInteger(h.line)) return { reply: text };
  const line = h.line as number;
  if (line < 1 || line > lineCount) return { reply: text };
  const end = Number.isInteger(h.endLine) ? Math.min(Math.max(h.endLine as number, line), lineCount) : line;
  const note = typeof h.note === "string" ? h.note.trim().slice(0, MAX_NOTE) : "";
  return { reply: text, highlight: { line, ...(end > line ? { endLine: end } : {}), note } };
}

/** undefined -> []; malformed -> null. Keeps only the most recent turns and trims each. */
function parseHistory(raw: unknown): ChatTurn[] | null {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return null;
  const turns: ChatTurn[] = [];
  for (const m of raw.slice(-MAX_HISTORY_TURNS)) {
    if (!m || (m.role !== "user" && m.role !== "assistant") || typeof m.text !== "string") return null;
    turns.push({ role: m.role, text: m.text.slice(0, MAX_TURN_TEXT) });
  }
  return turns;
}

/** Runs the completion and maps failures to clean JSON errors (never leaks OpenAI's error text or status). */
async function reply(res: Response, run: () => Promise<AiHintResponse | AiDraftResponse>): Promise<void> {
  try {
    res.json(await run());
  } catch (err) {
    if (err instanceof AiNotConfiguredError) {
      res.status(503).json({ error: err.message });
      return;
    }
    console.error("[ai] completion failed:", err instanceof Error ? err.message : err);
    res.status(502).json({ error: "The AI service is unavailable right now. Please try again." });
  }
}

const notConfigured = (res: Response) =>
  res.status(503).json({ error: new AiNotConfiguredError().message });

aiRouter.post("/hint", requireRole("student"), rateLimit, async (req, res) => {
  const { moduleId, studentId, question, code, exerciseId, error } = (req.body ?? {}) as Partial<AiHintRequest>;
  const history = parseHistory(req.body?.history);
  if (
    typeof moduleId !== "string" ||
    typeof studentId !== "string" ||
    typeof question !== "string" ||
    !question.trim() ||
    question.length > MAX_QUESTION ||
    !history ||
    (code !== undefined && (typeof code !== "string" || code.length > MAX_CODE)) ||
    (exerciseId !== undefined && typeof exerciseId !== "string") ||
    (error !== undefined && (typeof error !== "string" || error.length > MAX_RUN_ERROR))
  ) {
    res.status(400).json({
      error: `moduleId, studentId and a question (max ${MAX_QUESTION} chars) are required; history, code, exerciseId and error must be well-formed`,
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
  const { text: context, module } = await studentViewFor(row);
  const note = exerciseId ? exerciseNote(module, exerciseId) : null;
  if (exerciseId && !note) {
    res.status(404).json({ error: "Exercise not found" });
    return;
  }

  // With code attached the tutor replies in JSON so it can also point at a line (see LOCATE_RULES).
  const hasCode = Boolean(code?.trim());
  const parts = [question.trim()];
  if (error?.trim()) parts.push(`My last run failed with:\n${error.trim()}`);
  if (hasCode) parts.push(`My current code:\n${numbered(code!)}`);
  const message = parts.join("\n\n");

  await reply(res, async () => {
    const text = await complete({
      system: hintSystemPrompt(context, { locate: hasCode, exerciseNote: note }),
      history,
      message,
      maxTokens: hasCode ? 500 : 400, // hints are short by design
      json: hasCode,
    });
    return hasCode ? parseLocated(text, code!.split("\n").length) : { reply: text };
  });
});

// Stretch: teacher-facing drafting/planning assistant.
aiRouter.post("/draft", requireRole("teacher"), rateLimit, async (req, res) => {
  const { request, moduleId, draft } = (req.body ?? {}) as Partial<AiDraftRequest>;
  const history = parseHistory(req.body?.history);
  if (
    typeof request !== "string" ||
    !request.trim() ||
    request.length > MAX_DRAFT_REQUEST ||
    !history ||
    (moduleId !== undefined && typeof moduleId !== "string") ||
    (draft !== undefined && (typeof draft !== "string" || draft.length > MAX_DRAFT))
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
    moduleContext = teacherModuleContext((await aggregate(row, true)) as TeacherModule);
  }

  await reply(res, async () => ({
    reply: await complete({
      system: draftSystemPrompt(moduleContext, draft?.trim() || null),
      history,
      message: request.trim(),
      maxTokens: 1500,
    }),
  }));
});
