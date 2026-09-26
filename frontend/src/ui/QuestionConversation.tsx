import { useEffect, useState, type FormEvent } from "react";
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
  const { user } = useAuth();
  const targetStudentId = studentId ?? user?.id;
  const [comments, setComments] = useState<QuestionComment[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!targetStudentId) return;
    let cancelled = false;
    api
      .getQuestionComments(questionId, targetStudentId)
      .then((entries) => {
        if (!cancelled) setComments(entries);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Could not load the conversation");
      });
    return () => {
      cancelled = true;
    };
  }, [questionId, targetStudentId]);

  useEffect(
    () =>
      onQuestionCommentCreated((update) => {
        const comment = update.comment;
        if (comment.questionId !== questionId || comment.studentId !== targetStudentId) return;
        setComments((current) =>
          current.some((entry) => entry.id === comment.id) ? current : [...current, comment],
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
        current.some((entry) => entry.id === comment.id) ? current : [...current, comment],
      );
      setText("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not send your message");
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-4">
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>{user?.role === "teacher" ? "Student conversation" : "Ask your teacher"}</Eyebrow>
        <span className="text-xs text-muted">{comments.length ? `${comments.length} messages` : "Private to you and your teachers"}</span>
      </div>
      {comments.length > 0 && (
        <ul className="m-0 flex max-h-56 list-none flex-col gap-2 overflow-y-auto p-0" aria-live="polite">
          {comments.map((comment) => {
            const mine = comment.authorId === user?.id;
            return (
              <li key={comment.id} className={`flex flex-col gap-1 rounded-xl px-3 py-2.5 text-sm ${mine ? TINT.mint : TINT.lavender}`}>
                <span className="text-xs font-medium text-muted">{mine ? "You" : user?.role === "teacher" ? "Student" : "Teacher"}</span>
                <span className="whitespace-pre-wrap text-ink">{comment.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={send} className="flex flex-col gap-2">
        <label className="sr-only" htmlFor={`question-comment-${questionId}`}>Message</label>
        <textarea
          id={`question-comment-${questionId}`}
          className={`${INPUT} min-h-20 resize-y py-2.5`}
          value={text}
          maxLength={4000}
          onChange={(event) => setText(event.target.value)}
          placeholder={user?.role === "teacher" ? "Leave feedback or a helpful prompt…" : "Tell your teacher where you are stuck…"}
        />
        <div className="flex items-center justify-between gap-3">
          {error ? <span className={`text-xs ${TINT.peach}`}>{error}</span> : <span className="text-xs text-muted">Messages update live.</span>}
          <Button type="submit" size="sm" variant="primary" disabled={sending || !text.trim()}>
            {sending ? "Sending…" : "Send"}
          </Button>
        </div>
      </form>
    </section>
  );
}
