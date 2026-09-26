import { useEffect, useRef, useState, type FormEvent } from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import { onQuestionCommentCreated } from "../socket.ts";
import Button from "./Button.tsx";
import Eyebrow from "./Eyebrow.tsx";
import { INPUT, TINT } from "./styles.ts";
import type { QuestionComment } from "../../../shared/types";

/** A student-specific, live conversation embedded beside one lesson question. */
export default function QuestionConversation({
  questionId,
  studentId,
}: {
  questionId: string;
  /** Required by teacher views; students automatically use their own id. */
  studentId?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <section className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-soft p-4">
        <div className="flex flex-col gap-1">
          <Eyebrow>Ask your teacher</Eyebrow>
          <span className="text-sm text-muted">
            Start a private conversation about this question.
          </span>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          Open conversation
        </Button>
      </section>
    );
  return <Conversation questionId={questionId} studentId={studentId} />;
}

function Conversation({
  questionId,
  studentId,
}: {
  questionId: string;
  studentId?: string;
}) {
  const { user } = useAuth();
  const targetStudentId = studentId ?? user?.id;
  const [comments, setComments] = useState<QuestionComment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const requestId = useRef(0);

  const load = () => {
    if (!targetStudentId) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(null);
    api
      .getQuestionComments(questionId, targetStudentId)
      .then((entries) => {
        if (currentRequest === requestId.current) setComments(entries);
      })
      .catch((reason) => {
        if (currentRequest === requestId.current)
          setError(
            reason instanceof Error
              ? reason.message
              : "Could not load the conversation",
          );
      })
      .finally(() => {
        if (currentRequest === requestId.current) setLoading(false);
      });
  };
  useEffect(() => {
    load();
    return () => {
      requestId.current += 1;
    };
    // The conversation is mounted only after explicit expansion.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionId, targetStudentId]);

  useEffect(
    () =>
      onQuestionCommentCreated((update) => {
        const comment = update.comment;
        if (
          comment.questionId !== questionId ||
          comment.studentId !== targetStudentId
        )
          return;
        setComments((current) =>
          current.some((entry) => entry.id === comment.id)
            ? current
            : [...current, comment],
        );
      }),
    [questionId, targetStudentId],
  );

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || !targetStudentId || sending) return;
    setSending(true);
    setError(null);
    try {
      const comment = await api.createQuestionComment(questionId, {
        text,
        ...(user?.role === "teacher" ? { studentId: targetStudentId } : {}),
      });
      setComments((current) =>
        current.some((entry) => entry.id === comment.id)
          ? current
          : [...current, comment],
      );
      setText("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Could not send your message",
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>
          {user?.role === "teacher"
            ? "Student conversation"
            : "Ask your teacher"}
        </Eyebrow>
        <span className="text-xs text-muted">
          {comments.length
            ? `${comments.length} messages`
            : "Private to you and your teachers"}
        </span>
      </div>
      {loading ? (
        <div
          className="h-16 animate-pulse rounded-xl bg-surface motion-reduce:animate-none"
          aria-busy="true"
          aria-label="Loading conversation"
        />
      ) : error ? (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm ${TINT.peach}`}
          role="alert"
        >
          <span>{error}</span>
          <Button size="sm" variant="peach" onClick={load}>
            Try again
          </Button>
        </div>
      ) : comments.length === 0 ? (
        <p className="m-0 text-sm text-muted">
          No messages yet. Your teacher will see this conversation privately.
        </p>
      ) : (
        <ul
          className="m-0 flex max-h-56 list-none flex-col gap-2 overflow-y-auto p-0"
          aria-live="polite"
        >
          {comments.map((comment) => {
            const mine = comment.authorId === user?.id;
            return (
              <li
                key={comment.id}
                className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 text-sm ${mine ? TINT.mint : TINT.lavender}`}
              >
                <span className="text-xs font-medium text-muted">
                  {mine
                    ? "You"
                    : user?.role === "teacher"
                      ? "Student"
                      : "Teacher"}
                </span>
                <span className="whitespace-pre-wrap text-ink">
                  {comment.text}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={send} className="flex flex-col gap-2">
        <label className="sr-only" htmlFor={`question-comment-${questionId}`}>
          Message
        </label>
        <textarea
          id={`question-comment-${questionId}`}
          className={`${INPUT} min-h-20 resize-y py-2.5`}
          value={text}
          maxLength={4000}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            user?.role === "teacher"
              ? "Leave feedback or a helpful prompt…"
              : "Tell your teacher where you are stuck…"
          }
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">Messages update live.</span>
          <Button
            type="submit"
            size="sm"
            variant="primary"
            disabled={sending || !text.trim()}
          >
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </section>
  );
}
