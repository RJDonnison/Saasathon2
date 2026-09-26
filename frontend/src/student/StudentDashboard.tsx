import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import { onSessionUpdate } from "../socket.ts";
import Button from "../ui/Button.tsx";
import Dot from "../ui/Dot.tsx";
import { useDialog } from "../ui/DialogContext.tsx";
import Heading from "../ui/Heading.tsx";
import { CARD, TINT } from "../ui/styles.ts";
import InvitationList from "./InvitationList.tsx";
import { plural } from "./lessons.ts";
import type { MyClassroom } from "../../../shared/types";

/** Pages read the student's *active* classroom, so opening another class makes it the active one first. */
function useOpenClass() {
  const { switchClassroom } = useAuth();
  const { toast } = useDialog();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<string | null>(null);

  const open = async (item: MyClassroom, live: boolean) => {
    setOpening(item.id);
    try {
      if (!item.active) await switchClassroom(item.id);
      navigate(
        `/student/class/${item.id}${live ? `/live?lesson=${item.liveSession?.moduleId ?? ""}` : ""}`,
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not open this class.",
        "error",
      );
    } finally {
      setOpening(null);
    }
  };
  return { open, opening };
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { open, opening } = useOpenClass();
  const [classes, setClasses] = useState<MyClassroom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeId = user?.classroomId;

  const load = useCallback(async () => {
    try {
      const items = await api.myClassrooms();
      setClasses(items.filter((item) => item.role === "student"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load your classes");
      setClasses((current) => current ?? []);
    }
  }, []);

  // Live status for every class: refetch when the active class's session changes, and poll for the others
  // (session pushes only reach the classroom the student currently has open).
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    const unsubscribe = onSessionUpdate(() => void load());
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [load, activeId]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Morning" : hour < 18 ? "Afternoon" : "Evening";
  const today = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const firstName = user?.name.trim().split(/\s+/)[0] || "there";

  const live = (classes ?? []).filter((c) => c.liveSession);

  return (
    <div className="mx-auto flex max-w-[1020px] flex-col gap-6 sm:gap-7">
      <InvitationList />

      <div className="pt-1">
        <p className="mb-1! text-[13px]! font-medium! text-muted">{today}</p>
        <Heading
          as="h1"
          variant="title"
          className="text-[34px]! sm:text-[38px]!"
        >
          {greeting}, {firstName}
        </Heading>
        <p className="mt-2! text-[15px]! text-muted">
          {classes === null
            ? "Loading your classes…"
            : classes.length === 0
              ? "You are not in any classes yet."
              : live.length === 0
                ? `No classes are live right now. You are in ${classes.length} ${classes.length === 1 ? "class" : "classes"}.`
                : `${live.length} ${live.length === 1 ? "class is" : "classes are"} live now.`}
        </p>
      </div>

      {error && (
        <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <Heading>Live now</Heading>
        {classes === null ? (
          <div
            className="h-28 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none"
            aria-busy="true"
          />
        ) : live.length === 0 ? (
          <p className={`m-0 px-5 py-6 text-center text-sm text-muted ${CARD}`}>
            None of your teachers are running a lesson right now. Live lessons
            show up here as soon as they start.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {live.map((item) => {
              const session = item.liveSession!;
              const teacher = item.teacherName ?? "Your teacher";
              return (
                <div
                  key={item.id}
                  className="flex flex-col justify-between gap-5 rounded-2xl bg-ink p-6 text-white"
                >
                  <div className="min-w-0">
                    <span
                      className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${TINT.mint}`}
                    >
                      <Dot live />
                      Live now
                    </span>
                    <h2 className="m-0! font-display! text-[22px]! leading-tight! font-semibold! tracking-[-0.03em]! text-white">
                      {session.moduleTitle}
                    </h2>
                    <p className="mb-0! mt-2! text-sm! text-white/80">
                      {item.name} with {teacher}.{" "}
                      {session.phase === "teach"
                        ? "Teaching now. Join to follow along."
                        : "Work time. Join to work with the helper."}
                    </p>
                  </div>
                  <Button
                    variant="primary"
                    size="lg"
                    disabled={opening !== null}
                    onClick={() => void open(item, true)}
                  >
                    {opening === item.id ? "Joining…" : "Join lesson"}
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <Heading>All my classes</Heading>
        {classes === null ? (
          <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-32 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none"
              />
            ))}
          </div>
        ) : classes.length === 0 ? (
          <p className={`m-0 px-5 py-6 text-center text-sm text-muted ${CARD}`}>
            When a teacher invites you to a class, the invitation appears at the
            top of this page.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {classes.map((item) => (
              <article
                key={item.id}
                className={`${CARD} flex flex-col justify-between gap-4 p-5`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <strong className="block truncate text-[16px]">
                      {item.name}
                    </strong>
                    <span className="text-xs text-muted">
                      {item.teacherName ?? "No teacher yet"}
                    </span>
                  </div>
                  {item.liveSession && (
                    <span
                      className={`inline-flex flex-none items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TINT.mint}`}
                    >
                      <Dot live />
                      Live
                    </span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <div
                    className="flex gap-1"
                    role="img"
                    aria-label={`${item.completedCount} of ${plural(item.lessonCount, "lesson")} complete`}
                  >
                    {Array.from({ length: Math.min(item.lessonCount, 20) }).map(
                      (_, i) => (
                        <span
                          key={i}
                          className={`h-1.5 flex-1 rounded-full ${i < item.completedCount ? "bg-accent" : "bg-border"}`}
                        />
                      ),
                    )}
                  </div>
                  <span className="text-xs text-muted">
                    {item.lessonCount === 0
                      ? "No lessons yet"
                      : `${item.completedCount} of ${plural(item.lessonCount, "lesson")} complete`}
                  </span>
                </div>
                <Button
                  disabled={opening !== null}
                  onClick={() => void open(item, false)}
                >
                  {opening === item.id ? "Opening…" : "Open class"}
                </Button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
