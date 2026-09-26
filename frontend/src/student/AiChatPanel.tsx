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
import Eyebrow from "../ui/Eyebrow.tsx";
import Heading from "../ui/Heading.tsx";
import InlineText from "../ui/InlineText.tsx";
import { CodeIcon, SendIcon, SparklesIcon } from "../ui/icons.tsx";
import { CARD, INPUT, TINT } from "../ui/styles.ts";
import { useWorkspace } from "./useWorkspace.ts";
import type { AiChatMessage, AiCodeHighlight } from "../../../shared/types";

/** `spot` is where the tutor pointed in `code` (the editor text at send time), so the link can be disabled once it's stale. */
type Msg = {
  from: "me" | "ai" | "error";
  text: string;
  spot?: { editorKey: string; code: string; highlight: AiCodeHighlight };
};

const STARTERS = [
  "I don't understand the question",
  "Can I get a hint?",
  "My code doesn't work",
];
const FIND_ERROR =
  "Something is wrong with my code. Can you tell me where to look?";

// "I'm stuck" chat, scoped to the module the student is on. The AI gives hints, not answers.
// The server is stateless: we re-send the transcript (minus errors) with every question, plus the code of the
// editor the student last touched. When the tutor can locate a problem, the editor marks and scrolls to it.
// Mount with key={moduleId} so switching modules starts a fresh conversation.
export default function AiChatPanel({ moduleId }: { moduleId: string }) {
  const { user } = useAuth();
  const { active, activeQuestionId, codes, helpRequest, showHighlight } =
    useWorkspace();
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [thinking, setThinking] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the newest message in view (scroll the log itself, not the whole page).
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking]);

  // The freshest editor state, read at send time so a queued "find the error" never sends stale code.
  const latest = useRef({ active, codes, messages, thinking });
  useEffect(() => {
    latest.current = { active, codes, messages, thinking };
  });

  async function send(q: string, runError?: string) {
    const { active, codes, messages, thinking } = latest.current;
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
    setQuestion("");
    setMessages((m) => [...m, { from: "me", text: q }]);
    setThinking(true);
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
        showHighlight({
          editorKey: active.key,
          line: highlight.line,
          endLine: highlight.endLine ?? highlight.line,
          note: highlight.note,
        });
      }
      setMessages((m) => [...m, { from: "ai", text: reply, spot }]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          from: "error",
          text: err instanceof Error ? err.message : "Request failed",
        },
      ]);
    } finally {
      setThinking(false);
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
    <section className={`flex h-full min-h-0 flex-col overflow-hidden ${CARD}`}>
      <header className="flex flex-none items-center gap-3 border-b border-border px-5 py-4">
        <span
          className={`grid size-9 flex-none place-items-center rounded-xl ${TINT.lavender}`}
        >
          <SparklesIcon className="size-[18px]" />
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Eyebrow>Hints, not answers</Eyebrow>
          <Heading>I’m stuck</Heading>
        </div>
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
        className="flex max-h-[26rem] min-h-56 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4 lg:max-h-none"
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
                    ? "rounded-2xl rounded-br-md bg-ink text-white"
                    : m.from === "ai"
                      ? "rounded-2xl rounded-bl-md border border-border bg-surface-soft text-ink"
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

      <form
        onSubmit={ask}
        className="flex flex-none items-center gap-2 border-t border-border bg-surface-soft p-3"
      >
        <input
          ref={inputRef}
          className={`${INPUT} h-10 min-w-0 flex-1`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What are you stuck on?"
          aria-label="Your question"
          maxLength={2000}
        />
        <Button
          type="submit"
          variant="primary"
          size="icon"
          disabled={thinking || !question.trim()}
          className="flex-none"
          aria-label="Send"
        >
          <SendIcon className="size-4" />
        </Button>
      </form>
    </section>
  );
}
