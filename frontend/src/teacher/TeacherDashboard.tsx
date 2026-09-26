import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import { onSessionUpdate } from "../socket.ts";
import Button from "../ui/Button.tsx";
import Dot from "../ui/Dot.tsx";
import { useDialog } from "../ui/DialogContext.tsx";
import DashboardEmptyState from "../ui/DashboardEmptyState.tsx";
import Heading from "../ui/Heading.tsx";
import { UsersIcon } from "../ui/icons.tsx";
import { CARD, TINT } from "../ui/styles.ts";
import { plural } from "../student/lessons.ts";
import type { MyClassroom } from "../../../shared/types";

const SKELETON =
  "animate-pulse rounded-lg bg-surface-soft motion-reduce:animate-none";

function LoadingBlock({ className }: { className: string }) {
  return (
    <span aria-hidden="true" className={`block ${SKELETON} ${className}`} />
  );
}

/** Matches the dashboard's final shape, so loading does not make the page jump. */
function TeacherDashboardSkeleton() {
  return (
    <div
      className="flex flex-col gap-6 sm:gap-7"
      aria-busy="true"
      aria-label="Loading your classes"
    >
      <section className="flex flex-col gap-3">
        <Heading>Live now</Heading>
        <div className="flex flex-col gap-5 rounded-2xl bg-ink p-6">
          <div className="flex flex-col gap-3">
            <span
              aria-hidden="true"
              className="h-6 w-24 animate-pulse rounded-full bg-white/20 motion-reduce:animate-none"
            />
            <span
              aria-hidden="true"
              className="h-6 w-2/3 animate-pulse rounded-lg bg-white/20 motion-reduce:animate-none"
            />
            <span
              aria-hidden="true"
              className="h-4 w-1/2 animate-pulse rounded-lg bg-white/15 motion-reduce:animate-none"
            />
          </div>
          <span
            aria-hidden="true"
            className="h-11 w-36 animate-pulse rounded-xl bg-white/20 motion-reduce:animate-none"
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Heading>All classes</Heading>
        <div className="grid gap-4 sm:grid-cols-2">
          {[0, 1].map((index) => (
            <div key={index} className={`${CARD} flex flex-col gap-5 p-5`}>
              <div className="flex flex-col gap-2">
                <LoadingBlock className="h-5 w-3/5" />
                <LoadingBlock className="h-3 w-24" />
              </div>
              <LoadingBlock className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

/** The class screens read the teacher's *active* classroom, so opening another class makes it the active one first. */
function useOpenClass() {
  const { switchClassroom } = useAuth();
  const { toast } = useDialog();
  const navigate = useNavigate();
  const [opening, setOpening] = useState<string | null>(null);

  const open = async (item: MyClassroom) => {
    setOpening(item.id);
    try {
      if (!item.active) await switchClassroom(item.id);
      navigate(`/teacher/class/${item.id}`);
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

export default function TeacherDashboard() {
  const { user, createClassroom: createClassroomFor } = useAuth();
  const { prompt, toast } = useDialog();
  const navigate = useNavigate();
  const { open, opening } = useOpenClass();
  const [classes, setClasses] = useState<MyClassroom[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const activeId = user?.classroomId;

  const load = useCallback(async () => {
    try {
      const items = await api.myClassrooms();
      setClasses(items.filter((item) => item.role === "teacher"));
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not load your classes",
      );
      setClasses((current) => current ?? []);
    }
  }, []);

  // Session pushes only reach the classroom the teacher has active, so poll for the rest.
  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    const unsubscribe = onSessionUpdate(() => void load());
    return () => {
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [load, activeId]);

  async function createClassroom() {
    const name = await prompt({
      title: "Name your classroom",
      message: "Choose a name students will recognize.",
      confirmLabel: "Create classroom",
    });
    if (!name?.trim()) return;
    setCreating(true);
    try {
      const created = await createClassroomFor(name.trim());
      navigate(`/teacher/class/${created.classroomId}`);
    } catch (e) {
      toast(
        e instanceof Error ? e.message : "Could not create classroom",
        "error",
      );
    } finally {
      setCreating(false);
    }
  }

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
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 sm:gap-7">
      {classes?.length === 0 ? (
        <DashboardEmptyState
          eyebrow="Your teaching space"
          title={`Let’s get your classroom started, ${firstName}`}
          description="Bring your students together, plan lessons, and see their work as it happens. Start by creating your first classroom."
          icon={<UsersIcon className="size-7" />}
          notice={
            error ? (
              <p
                className={`m-0! w-full rounded-xl px-4 py-3 text-sm! ${TINT.peach}`}
              >
                {error}
              </p>
            ) : undefined
          }
          action={
            <Button
              variant="primary"
              size="lg"
              disabled={creating}
              onClick={() => void createClassroom()}
            >
              {creating ? "Creating…" : "＋ Create classroom"}
            </Button>
          }
        >
          <div className="grid w-full gap-2 border-t border-border pt-5 text-left sm:grid-cols-3">
            {[
              ["01", "Create a class"],
              ["02", "Add your students"],
              ["03", "Plan and teach"],
            ].map(([number, label]) => (
              <div
                key={number}
                className="rounded-xl bg-surface-soft px-3 py-3"
              >
                <span className="block text-xs font-medium text-muted">
                  {number}
                </span>
                <span className="mt-1 block text-sm font-medium text-ink">
                  {label}
                </span>
              </div>
            ))}
          </div>
        </DashboardEmptyState>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-4 pt-1">
            <div className="flex flex-col gap-2">
              <p className="m-0 text-[13px] font-medium text-muted">{today}</p>
              <Heading
                as="h1"
                variant="title"
                className="text-[34px]! sm:text-[38px]!"
              >
                {greeting}, {firstName}
              </Heading>
              <p className="m-0 text-[15px] text-muted">
                {classes === null
                  ? "Loading your classes…"
                  : classes.length === 0
                    ? "You have no classes yet. Create one to get started."
                    : live.length === 0
                      ? `No classes are live right now. You teach ${classes.length} ${classes.length === 1 ? "class" : "classes"}.`
                      : `${live.length} ${live.length === 1 ? "class is" : "classes are"} live now.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                disabled={creating}
                onClick={() => void createClassroom()}
              >
                {creating ? "Creating…" : "＋ New classroom"}
              </Button>
            </div>
          </div>

          {error && (
            <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>
              {error}
            </p>
          )}

          {classes === null ? (
            <TeacherDashboardSkeleton />
          ) : (
            <>
              <section className="flex flex-col gap-3">
                <Heading>Live now</Heading>
                {live.length === 0 ? (
                  <p
                    className={`m-0 px-5 py-6 text-center text-sm text-muted ${CARD}`}
                  >
                    None of your classes are running a lesson. Start one from a
                    class and it shows up here.
                  </p>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {live.map((item) => {
                      const session = item.liveSession!;
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
                              {item.name}.{" "}
                              {session.phase === "teach"
                                ? "Teaching now."
                                : "Work time, the helper is on."}
                            </p>
                          </div>
                          <Button
                            variant="primary"
                            size="lg"
                            disabled={opening !== null}
                            onClick={() => void open(item)}
                          >
                            {opening === item.id
                              ? "Opening…"
                              : "Open live class"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="flex flex-col gap-3">
                <Heading>All classes</Heading>
                {classes.length === 0 ? (
                  <p
                    className={`m-0 px-5 py-6 text-center text-sm text-muted ${CARD}`}
                  >
                    Create a classroom to invite students and build lessons.
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
                              {item.lessonCount === 0
                                ? "No lessons yet"
                                : plural(item.lessonCount, "lesson")}
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
                        <Button
                          disabled={opening !== null}
                          onClick={() => void open(item)}
                        >
                          {opening === item.id ? "Opening…" : "Open class"}
                        </Button>
                      </article>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
