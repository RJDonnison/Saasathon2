import { useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";
import Button from "../ui/Button.tsx";
import ClassTopBar from "../ui/ClassTopBar.tsx";
import Heading from "../ui/Heading.tsx";
import { CARD, FOCUS_RING, TINT } from "../ui/styles.ts";
import {
  introSnippet,
  lessonOverview,
  plural,
  STATUS_LABEL,
  timeAgo,
} from "./lessons.ts";
import { useClassData } from "./useClassData.ts";
import { useLiveSession } from "../useLiveSession.ts";
import Dot from "../ui/Dot.tsx";
import type { ExerciseSummary } from "../../../shared/types";

const RUN_LABEL = {
  ok: "Last run worked",
  error: "Last run had an error",
} as const;
const PULSE =
  "animate-pulse rounded-lg bg-surface-soft motion-reduce:animate-none";

function runLabel(ex: ExerciseSummary) {
  return ex.lastRun
    ? `${RUN_LABEL[ex.lastRun]}, ${plural(ex.runs, "run")}`
    : "Not started";
}

function LoadingBlock({ className }: { className: string }) {
  return <span aria-hidden="true" className={`block ${PULSE} ${className}`} />;
}

function LiveSessionSkeleton() {
  return (
    <section
      className="flex flex-col gap-4 rounded-2xl bg-ink p-5 sm:p-6"
      aria-busy="true"
      aria-label="Loading live lesson"
    >
      <div className="h-5 w-20 animate-pulse rounded-full bg-white/20 motion-reduce:animate-none" />
      <div className="h-5 w-2/3 animate-pulse rounded-lg bg-white/20 motion-reduce:animate-none" />
      <div className="h-4 w-1/2 animate-pulse rounded-lg bg-white/15 motion-reduce:animate-none" />
    </section>
  );
}

function LessonSummarySkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading lesson summary"
    >
      <LoadingBlock className="h-4 w-36" />
      <div className="flex flex-col gap-3">
        <LoadingBlock className="h-6 w-3/4" />
        <LoadingBlock className="h-4 w-full" />
        <LoadingBlock className="h-4 w-2/3" />
      </div>
      <div className="flex justify-end border-t border-border pt-4">
        <LoadingBlock className="h-10 w-32" />
      </div>
    </div>
  );
}

function AnnouncementsSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Loading announcements"
    >
      <LoadingBlock className="h-4 w-28" />
      {[0, 1].map((index) => (
        <div key={index} className="flex flex-col gap-2 rounded-xl bg-surface-soft p-3">
          <LoadingBlock className="h-3 w-16" />
          <LoadingBlock className="h-3 w-full" />
          <LoadingBlock className="h-3 w-4/5" />
        </div>
      ))}
    </div>
  );
}

function ProgressSkeleton() {
  return (
    <div
      className="flex flex-col gap-3"
      aria-busy="true"
      aria-label="Loading lesson progress"
    >
      <LoadingBlock className="h-4 w-24" />
      <LoadingBlock className="h-4 w-3/4" />
      <LoadingBlock className="h-2 w-full rounded-full" />
    </div>
  );
}

function LessonCarouselSkeleton() {
  return (
    <div
      className="flex flex-col gap-4"
      aria-busy="true"
      aria-label="Loading lessons"
    >
      <LoadingBlock className="h-5 w-24" />
      <div className="flex gap-3 overflow-hidden px-2">
        {[0, 1, 2].map((index) => (
          <div
            key={index}
            className={`flex w-[min(22rem,calc(100vw-2rem))] shrink-0 flex-col gap-4 p-5 sm:p-6 ${CARD}`}
          >
            <div className="flex justify-between gap-3">
              <div className="flex flex-col gap-2">
                <LoadingBlock className="h-3 w-16" />
                <LoadingBlock className="h-5 w-40" />
              </div>
              <LoadingBlock className="h-6 w-20 rounded-full" />
            </div>
            <LoadingBlock className="h-4 w-32" />
            <LoadingBlock className="h-4 w-full" />
            <LoadingBlock className="h-4 w-4/5" />
            <LoadingBlock className="h-10 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StudentClassPage() {
  const { classroomId = "" } = useParams();
  const { user } = useAuth();
  const { classroom, lessons, announcements, error } = useClassData();
  const { session } = useLiveSession();

  const teacher = classroom?.teacherName ?? "Your teacher";
  const classPath = `/student/class/${classroomId || user?.classroomId || ""}`;
  const all = lessons ?? [];
  const {
    completedCount: done,
    current,
  } = lessonOverview(all);
  const lessonScroller = useRef<HTMLDivElement>(null);
  const firstInProgressId = all.find(
    (lesson) => lesson.status === "in_progress",
  )?.id;
  const currentDescription = current ? introSnippet(current.content, 220) : "";
  const currentQuestionsRemaining = current
    ? Math.max(current.questionCount - current.startedQuestionCount, 0)
    : 0;

  useEffect(() => {
    if (!firstInProgressId) return;

    lessonScroller.current
      ?.querySelector<HTMLElement>('[data-current="true"]')
      ?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "start" });
  }, [firstInProgressId]);

  return (
    <>
      <ClassTopBar
        backTo="/student"
        title={classroom?.name ?? <LoadingBlock className="h-5 w-36" />}
        subtitle={classroom ? teacher : <LoadingBlock className="h-3 w-24" />}
      />
      <div className="mx-auto max-w-[1020px] px-4 py-6 sm:px-6 sm:py-8">
        {error && (
          <p className={`mb-5 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>
            {error}
          </p>
        )}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-5 lg:flex-row">
            <div className="flex min-w-0 flex-col gap-5 lg:flex-[1.7]">
              {session === undefined || classroom === null ? (
                <LiveSessionSkeleton />
              ) : session ? (
              <section className="flex flex-col justify-between gap-4 rounded-2xl bg-ink p-5 text-white sm:flex-row sm:items-center sm:p-6">
                <div className="min-w-0">
                  <span
                    className={`mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${TINT.mint}`}
                  >
                    <Dot live />
                    Live now
                  </span>
                  <h2 className="m-0! font-display! text-[20px]! leading-tight! font-semibold! text-white">
                    {session.moduleTitle}
                  </h2>
                  <p className="mb-0! mt-1.5! text-sm! text-white/80">
                    {teacher} is{" "}
                    {session.phase === "teach"
                      ? "teaching"
                      : "running work time"}
                    .
                  </p>
                </div>
                <Link to={`${classPath}/live`}>
                  <Button variant="primary" size="lg">
                    Join lesson
                  </Button>
                </Link>
              </section>
              ) : null}

              <section className={`flex flex-col gap-4 ${CARD} p-5 sm:p-6`}>
              {lessons === null || classroom === null ? (
                <LessonSummarySkeleton />
              ) : current ? (
                <>
                  <Heading>
                    {current.status === "in_progress"
                      ? "Pick up where you left off"
                      : "Start your next lesson"}
                  </Heading>
                  <div className="flex flex-col gap-1">
                    <h3 className="m-0! font-display! text-[20px]! font-semibold!">
                      {current.title}
                    </h3>
                  {(currentDescription || current.questionCount > 0) && (
                    <div className="flex flex-col gap-3">
                      {currentDescription && (
                        <p className="m-0! text-[14px]! text-muted">
                          {currentDescription}
                        </p>
                      )}
                      {current.questionCount > 0 && (
                        <p className="m-0! self-start rounded-lg bg-surface-soft px-3 py-2 text-xs! font-medium! text-muted">
                          {plural(currentQuestionsRemaining, "question")} remaining
                        </p>
                      )}
                  </div>
                  )}
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
                    <Link to={`${classPath}/live?lesson=${current.id}`}>
                      <Button variant="primary" size="lg">
                        {current.status === "not_started"
                          ? "Start lesson"
                          : "Continue lesson"}
                      </Button>
                    </Link>
                  </div>
                </>
              ) : (
                <p className="mb-0! mt-3! text-[14px]! text-muted">
                  {all.length
                    ? "You’ve finished every lesson. Reopen any of them below."
                    : `${teacher} hasn’t added any lessons yet.`}
                </p>
              )}
              </section>

            </div>
            <aside className="flex min-w-0 flex-col gap-5 lg:flex-1">

            <section className={`flex h-full flex-col ${CARD} p-5`}>
              {announcements === null || classroom === null ? (
                <AnnouncementsSkeleton />
              ) : (
                <>
                  <Heading>From {teacher}</Heading>
                  {announcements.length === 0 ? (
                <p className="mb-0! mt-3! text-[13px]! text-muted">
                  No notes yet.
                </p>
              ) : (
                announcements.slice(0, 5).map((note) => (
                  <div
                    key={note.id}
                    className="mt-3 rounded-xl bg-surface-soft p-3 first:mt-3"
                  >
                    <strong className="text-xs">
                      {timeAgo(note.createdAt)}
                    </strong>
                    <p className="mb-0! mt-1! text-[13px]! whitespace-pre-line">
                      {note.text}
                    </p>
                  </div>
                ))
              )}
                </>
              )}
            </section>

              <section className={`${CARD} p-5`}>
                {lessons === null ? (
                  <ProgressSkeleton />
                ) : (
                  <>
                    <Heading>Your progress</Heading>
                    <p className="mb-0! mt-3! text-[14px]!">
                      {all.length
                        ? `${done} of ${plural(all.length, "lesson")} complete`
                        : "No lessons to complete yet."}
                    </p>
                    {all.length > 0 && (
                      <div
                        className="mt-3 flex gap-1"
                        role="img"
                        aria-label={`${done} of ${all.length} lessons complete`}
                      >
                        {all.map((l) => (
                          <span
                            key={l.id}
                            className={`h-2 flex-1 rounded-full ${l.status === "completed" ? "bg-accent" : l.status === "in_progress" ? "bg-accent/40" : "bg-surface-soft"}`}
                          />
                        ))}
                      </div>
                    )}
                  </>
                )}
              </section>
            </aside>
          </div>

          <section>
            {lessons === null ? (
              <LessonCarouselSkeleton />
            ) : (
              <>
              <Heading className="pb-4">Lessons</Heading>
              {all.length === 0 && lessons !== null && (
                <p className={`${CARD} m-0 p-5 text-sm text-muted`}>
                  No lessons yet.
                </p>
              )}
              <div className="relative">
                <div
                  ref={lessonScroller}
                  className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain scroll-px-2 px-2 pb-4"
                  aria-label="Lessons"
                >
                  {all.map((lesson, i) => (
                    <Link
                      key={lesson.id}
                      to={`${classPath}/live?lesson=${lesson.id}`}
                      data-current={lesson.id === firstInProgressId || undefined}
                      className={`block w-[min(22rem,calc(100vw-2rem))] shrink-0 snap-start ${FOCUS_RING} `}
                    >
                    <article className={`${CARD} h-full p-5 sm:p-6 hover:bg-mint/50 transition-colors`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mb-1! text-xs! font-medium! text-muted">
                          Lesson {i + 1}
                        </p>
                        <h3 className="m-0! font-display! text-[17px]! font-semibold!">
                          {lesson.title}
                        </h3>
                      </div>
                      <span
                        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${lesson.status === "completed" ? TINT.mint : lesson.status === "in_progress" ? TINT.peach : "bg-surface-soft text-muted"}`}
                      >
                        {STATUS_LABEL[lesson.status]}
                      </span>
                    </div>
                    {lesson.sections.length > 0 && (
                      <>
                        <h4 className="mb-2! mt-4! font-display! text-[13px]! font-semibold!">
                          What’s in this lesson
                        </h4>
                        <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
                          {lesson.sections.map((section, n) => (
                            <li
                              key={section.id}
                              className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-soft px-2.5 py-1.5 text-xs"
                            >
                              <b className="grid size-5 place-items-center rounded-full bg-surface text-[10px]">
                                {n + 1}
                              </b>
                              {section.title}
                            </li>
                          ))}
                        </ol>
                      </>
                    )}
                    {lesson.exercises.length > 0 && (
                      <>
                        <h4 className="mb-1! mt-4! font-display! text-[13px]! font-semibold!">
                          Your work
                        </h4>
                        {lesson.exercises.map((ex) => (
                          <div
                            key={ex.id}
                            className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-[13px] last:border-0"
                          >
                            <span className="min-w-0 truncate">{ex.title}</span>
                            <span
                              className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${ex.lastRun === "ok" ? TINT.mint : ex.lastRun === "error" ? TINT.peach : "bg-surface-soft text-muted"}`}
                            >
                              {runLabel(ex)}
                            </span>
                          </div>
                        ))}
                      </>
                    )}
                    </article>
                    </Link>
                  ))}
                </div>
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 left-0 w-4 bg-linear-to-r from-canvas to-transparent"
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-y-0 right-0 w-4 bg-linear-to-l from-canvas to-transparent"
                />
              </div>
              </>
            )}
            </section>
        </div>
      </div>
    </>
  );
}
