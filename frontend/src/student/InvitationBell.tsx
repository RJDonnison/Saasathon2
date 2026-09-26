import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api.ts";
import { BellIcon } from "../ui/icons.tsx";
import { FOCUS_RING } from "../ui/styles.ts";
import { useStudentNotifications } from "./StudentNotifications.tsx";

/** Header bell for invitations and feedback that a student can open when ready. */
export default function InvitationBell() {
  const [invitationCount, setInvitationCount] = useState(0);
  const [open, setOpen] = useState(false);
  const { feedback, dismissFeedback } = useStudentNotifications();
  const navigate = useNavigate();
  useEffect(() => {
    const load = () =>
      void api
        .myInvitations()
        .then((list) => setInvitationCount(list.length))
        .catch(() => {});
    load();
    const interval = window.setInterval(load, 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const count = invitationCount + feedback.length;

  function openFeedback(item: (typeof feedback)[number]) {
    dismissFeedback(item.id);
    setOpen(false);
    navigate(
      `/student/class/${encodeURIComponent(item.classroomId)}/live?lesson=${encodeURIComponent(item.moduleId)}&question=${encodeURIComponent(item.questionId)}`,
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={count ? `${count} notification${count === 1 ? "" : "s"}` : "No notifications"}
        aria-expanded={open}
        aria-controls="student-notifications"
        onClick={() => setOpen((current) => !current)}
        className={`relative inline-grid size-[38px] place-items-center rounded-[9px] border border-border bg-surface text-ink hover:bg-surface-soft ${FOCUS_RING}`}
      >
        <BellIcon className="size-[18px]" />
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-coral px-1 text-[11px] leading-5 font-semibold text-white">
            {count}
          </span>
        )}
      </button>
      {open && (
        <section
          id="student-notifications"
          aria-label="Notifications"
          className="absolute right-0 z-30 mt-2 flex w-[min(22rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-lg"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <strong className="text-sm">Notifications</strong>
            {count > 0 && <span className="text-xs text-muted">{count} new</span>}
          </div>
          <div className="flex max-h-80 flex-col overflow-y-auto">
            {feedback.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openFeedback(item)}
                className={`flex flex-col gap-1 border-b border-border px-4 py-3 text-left hover:bg-surface-soft ${FOCUS_RING}`}
              >
                <span className="text-sm! font-semibold! text-ink">New teacher feedback</span>
                <span className="truncate text-xs text-muted">{item.text}</span>
              </button>
            ))}
            {invitationCount > 0 && (
              <Link
                to="/student"
                onClick={() => setOpen(false)}
                className={`flex flex-col gap-1 px-4 py-3 text-ink! no-underline! hover:bg-surface-soft ${FOCUS_RING}`}
              >
                <span className="text-sm! font-semibold!">{invitationCount} pending invitation{invitationCount === 1 ? "" : "s"}</span>
                <span className="text-xs text-muted">Review your class invitations.</span>
              </Link>
            )}
            {count === 0 && (
              <p className="m-0 px-4 py-5 text-center text-sm text-muted">You’re all caught up.</p>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
