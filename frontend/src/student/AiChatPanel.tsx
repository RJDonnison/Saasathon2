import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import Button from "../ui/Button.tsx";
import Heading from "../ui/Heading.tsx";
import InlineText from "../ui/InlineText.tsx";
import { CodeIcon, LightbulbIcon, SendIcon } from "../ui/icons.tsx";
import { INPUT, TINT } from "../ui/styles.ts";
import { useWorkspace } from "./useWorkspace.ts";
import type { AiChatMessage, AiCodeHighlight } from "../../../shared/types";

/** `spot` is where the tutor pointed in `code` (the editor text at send time), so the link can be disabled once it's stale. */
type Msg = {
  from: "me" | "ai" | "error";
  text: string;
  spot?: { editorKey: string; code: string; highlight: AiCodeHighlight };
};

const EMPTY: Msg[] = [];
const MAX_SAVED = 40;

// Conversations are kept per student and lesson in this browser (the server is stateless by design). Storage can be
// unavailable or full (private windows, blocked site data), so every access is best-effort.
const storageKey = (userId: string, moduleId: string) =>
  `loop:tutor-chat:${userId}:${moduleId}`;

function loadChat(userId: string, moduleId: string): Msg[] {
  try {
    const raw = localStorage.getItem(storageKey(userId, moduleId));
    const data: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(data)) return EMPTY;
    return data.filter(
      (m): m is Msg =>
        !!m &&
        (m.from === "me" || m.from === "ai" || m.from === "error") &&
        typeof m.text === "string",
    );
  } catch {
    return EMPTY;
  }
}

function saveChat(userId: string, moduleId: string, messages: Msg[]) {
  try {
    if (messages.length === 0)
      localStorage.removeItem(storageKey(userId, moduleId));
    else
      localStorage.setItem(
        storageKey(userId, moduleId),
        JSON.stringify(messages.slice(-MAX_SAVED)),
      );
  } catch {
    // Not persisted; the conversation still works for this session.
  }
}

const STARTERS = [
  "I don't understand the question",
  "Can I get a hint?",
  "My code doesn't work",
];
const FIND_ERROR =
  "Something is wrong with my code. Can you tell me where to look?";

// "I'm stuck" chat, scoped to the module the student is on. The AI gives hints, not answers.
// Each module keeps its own conversation: it survives switching modules and reloading the page (see loadChat).
// The panel stays mounted across modules, so a reply that arrives after switching lands in the module it was asked in.
// The server is stateless: we re-send the transcript (minus errors) with every question, plus the code of the
// editor the student last touched. When the tutor can locate a problem, the editor marks and scrolls to it.
export default function AiChatPanel({ moduleId }: { moduleId: string }) {
  const { user } = useAuth();
  const {
    active,
    activeQuestionId,
    codes,
    runErrors,
    helpRequest,
    showHighlight,
  } = useWorkspace();
  const [question, setQuestion] = useState("");
  const [chats, setChats] = useState<Record<string, Msg[]>>({});
  const [thinkingIn, setThinkingIn] = useState<Record<string, boolean>>({});
  // Load a module's saved conversation the first time we see it. Adjusting state during render re-renders
  // immediately, before anything is committed or saved, so the empty placeholder is never written back.
  const loaded = moduleId in chats;
  if (user && !loaded)
    setChats((c) => ({ ...c, [moduleId]: loadChat(user.id, moduleId) }));
  const messages = chats[moduleId] ?? EMPTY;
  const thinking = thinkingIn[moduleId] ?? false;
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (user && loaded) saveChat(user.id, moduleId, messages);
  }, [user, loaded, moduleId, messages]);

  const addMessage = (forModule: string, msg: Msg) =>
    setChats((c) => ({ ...c, [forModule]: [...(c[forModule] ?? EMPTY), msg] }));

  // Keep the newest message in view (scroll the log itself, not the whole page).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  // The freshest editor state, read at send time so a queued "find the error" never sends stale code.
  const latest = useRef({
    moduleId,
    active,
    activeQuestionId,
    codes,
    runErrors,
    messages,
    thinking,
  });
  useEffect(() => {
    latest.current = {
      moduleId,
      active,
      activeQuestionId,
      codes,
      runErrors,
      messages,
      thinking,
    };
  });

  async function send(q: string, requestedError?: string) {
    const { active, activeQuestionId, codes, runErrors, messages, thinking } =
      latest.current;
    const asked = moduleId; // this conversation, even if the student switches modules while we wait
    if (!user || !q || thinking) return;
    const history: AiChatMessage[] = messages
      .filter((m) => m.from !== "error")
      .map((m) => ({
        role: m.from === "me" ? "user" : "assistant",
        text: m.text,
      }));
    const code = activeQuestionId
      ? undefined
      : active
        ? codes[active.key]
        : undefined;
    // Prefer the current editor's stored result; the explicit value keeps the Find the error action
    // reliable even if it is clicked immediately after a run state update.
    const runError = active
      ? (runErrors[active.key] ?? requestedError)
      : requestedError;
    setQuestion("");
    addMessage(asked, { from: "me", text: q });
    setThinkingIn((t) => ({ ...t, [asked]: true }));
    try {
      const { reply, highlight } = await api.aiHint({
        moduleId,
        studentId: user.id,
        question: q,
        history,
        ...(activeQuestionId
          ? { questionId: activeQuestionId }
          : code?.trim() && active
            ? { code, exerciseId: active.exerciseId }
            : {}),
        ...(runError ? { error: runError.slice(0, 2000) } : {}),
      });
      let spot: Msg["spot"];
      if (highlight && active && code) {
        spot = { editorKey: active.key, code, highlight };
        // The editors on screen belong to whichever module is open now; only mark them if that's still this one.
        if (latest.current.moduleId === asked) {
          showHighlight({
            editorKey: active.key,
            line: highlight.line,
            endLine: highlight.endLine ?? highlight.line,
            note: highlight.note,
          });
        }
      }
      addMessage(asked, { from: "ai", text: reply, spot });
    } catch (err) {
      addMessage(asked, {
        from: "error",
        text: err instanceof Error ? err.message : "Request failed",
      });
    } finally {
      setThinkingIn((t) => ({ ...t, [asked]: false }));
    }
  }

  // An editor's "Find the error" button asks the tutor to look. Handle each request once (StrictMode re-runs effects).
  const handled = useRef(0);
  const onHelpRequest = useEffectEvent(
    (error?: string) => void send(FIND_ERROR, error),
  );
  useEffect(() => {
    if (!helpRequest || helpRequest.nonce === handled.current) return;
    handled.current = helpRequest.nonce;
    onHelpRequest(helpRequest.error);
  }, [helpRequest]);

  function ask(e: FormEvent) {
    e.preventDefault();
    void send(question.trim());
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-surface">
      <header className="flex flex-none flex-col gap-2.5 border-b border-border px-5 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              className={`grid size-10 flex-none place-items-center rounded-full ${TINT.lavender}`}
            >
              <LightbulbIcon className="size-[18px]" />
            </span>
            <Heading variant="name">Helper</Heading>
          </div>
          <div className="flex items-center gap-2">
            {messages.length > 0 && (
              <Button
                size="sm"
                disabled={thinking}
                onClick={() => setChats((c) => ({ ...c, [moduleId]: EMPTY }))}
              >
                Clear chat
              </Button>
            )}
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${TINT.lavender}`}
            >
              Hints only
            </span>
          </div>
        </div>
        <p className="m-0 text-[13px] leading-relaxed text-muted">Hints, not answers. Ask about the lesson you’re on and it will nudge you in the right direction.</p>
      </header>

      <p className="m-0 flex flex-none items-center gap-2 border-b border-border bg-surface-soft px-5 py-2 text-xs text-muted">
        <CodeIcon className="size-3.5 flex-none" />
        <span className="min-w-0 truncate">
          {activeQuestionId
            ? "Looking at the math question you selected"
            : active
              ? `Looking at ${active.label}`
              : "Select a question or click into an editor"}
        </span>
      </p>

      <div
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-label="Conversation with your tutor"
        className="flex max-h-[26rem] min-h-56 flex-1 flex-col gap-3 overflow-y-auto bg-canvas px-5 py-4 lg:max-h-none"
      >
        {messages.length === 0 && !thinking ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <p className="m-0 max-w-56 text-sm leading-relaxed text-muted">
              Tell the tutor where you’re stuck. It’ll nudge you in the right
              direction.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {STARTERS.map((s) => (
                <Button
                  key={s}
                  size="sm"
                  onClick={() => {
                    setQuestion(s);
                    inputRef.current?.focus();
                  }}
                >
                  {s}
                </Button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[88%] px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.from === "me"
                    ? "rounded-2xl rounded-br-md border border-border bg-surface text-ink"
                    : m.from === "ai"
                      ? `rounded-2xl rounded-bl-md ${TINT.lavender} text-ink!`
                      : `rounded-2xl rounded-bl-md ${TINT.peach}`
                }`}
              >
                <div className="flex flex-col items-start gap-2.5">
                  <p className="m-0">
                    {m.from === "error" && (
                      <strong className="font-semibold">
                        Couldn’t reach the tutor:{" "}
                      </strong>
                    )}
                    <InlineText text={m.text} />
                  </p>
                  {m.spot && (
                    <Button
                      size="sm"
                      disabled={codes[m.spot.editorKey] !== m.spot.code}
                      onClick={() =>
                        showHighlight({
                          editorKey: m.spot!.editorKey,
                          line: m.spot!.highlight.line,
                          endLine:
                            m.spot!.highlight.endLine ?? m.spot!.highlight.line,
                          note: m.spot!.highlight.note,
                        })
                      }
                    >
                      <CodeIcon className="size-3.5" />
                      Show me line {m.spot.highlight.line}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
        {thinking && (
          <div
            className="flex justify-start"
            role="status"
            aria-label="Tutor is thinking"
          >
            <div className="flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-border bg-surface-soft px-4 py-3.5">
              <i className="size-1.5 animate-bounce rounded-full bg-muted motion-reduce:animate-none" />
              <i className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:150ms] motion-reduce:animate-none" />
              <i className="size-1.5 animate-bounce rounded-full bg-muted [animation-delay:300ms] motion-reduce:animate-none" />
            </div>
          </div>
        )}
      </div>

      <form onSubmit={ask} className="flex flex-none flex-col gap-2 border-t border-border bg-surface p-4">
        <label htmlFor="helper-question" className="text-[13px] font-semibold text-muted">
          Ask the helper
        </label>
        <div className="flex items-center gap-2">
          <input
            id="helper-question"
            ref={inputRef}
            className={`${INPUT} h-11 min-w-0 flex-1`}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask for a hint"
            maxLength={2000}
          />
          <Button type="submit" variant="primary" size="lg" disabled={thinking || !question.trim()} className="size-11 flex-none p-0" aria-label="Send">
            <SendIcon className="size-4" />
          </Button>
        </div>
        <p className="m-0 text-xs text-muted">The helper gives hints, never full answers.</p>
      </form>
    </section>
  );
}
