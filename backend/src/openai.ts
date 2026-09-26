import OpenAI from "openai";
import "./config.js"; // ensure .env is loaded before reading process.env

// Thin wrapper over the OpenAI chat API. The client is created lazily so the backend still boots
// without OPENAI_API_KEY (only the /api/ai/* routes fail, with a clear 503).

/** Override with OPENAI_MODEL. Any chat-completions-capable model works. */
export const AI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI is not configured on the server (OPENAI_API_KEY is not set).");
    this.name = "AiNotConfiguredError";
  }
}

export const isAiConfigured = () => Boolean(process.env.OPENAI_API_KEY);

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) throw new AiNotConfiguredError();
  // Also honours OPENAI_BASE_URL (handy for pointing at a proxy or a local stand-in).
  return (client ??= new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 30_000,
    maxRetries: 1,
  }));
}

export interface ChatTurn {
  role: "user" | "assistant";
  text: string;
}

/** One stateless completion: system prompt + prior turns + the new user message -> reply text. */
export async function complete(opts: {
  system: string;
  history: ChatTurn[];
  message: string;
  maxTokens: number;
  /** Ask for a JSON object reply (the system prompt must describe the shape and mention JSON). */
  json?: boolean;
}): Promise<string> {
  const res = await getClient().chat.completions.create({
    model: AI_MODEL,
    max_completion_tokens: opts.maxTokens,
    ...(opts.json ? { response_format: { type: "json_object" as const } } : {}),
    messages: [
      { role: "system", content: opts.system },
      ...opts.history.map((t) => ({ role: t.role, content: t.text })),
      { role: "user", content: opts.message },
    ],
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI returned an empty completion");
  return text;
}
