import { useEffect, useMemo, useState } from "react";
import { api } from "../api.ts";
import { plural, STATUS_LABEL, timeAgo } from "../student/lessons.ts";
import Avatar from "../ui/Avatar.tsx";
import Card from "../ui/Card.tsx";
import Dot from "../ui/Dot.tsx";
import Heading from "../ui/Heading.tsx";
import { BookIcon } from "../ui/icons.tsx";
import { TINT } from "../ui/styles.ts";
import type {
  Module,
  ProgressStatus,
  StudentActivitySnapshot,
  TeacherModule,
  TeacherStudentAggregate,
  LiveModuleStudentAggregate,
  User,
} from "../../../shared/types";

const STATUS_TINT: Record<ProgressStatus, string> = {
  not_started: "bg-surface-soft text-muted",
  in_progress: TINT.peach,
  completed: TINT.mint,
};
const QUESTION_STATUS_TINT = {
  completed: TINT.mint,
  working: TINT.lavender,
  in_progress: TINT.peach,
  not_started: "bg-surface-soft text-muted",
};

type QuestionStatus = keyof typeof QUESTION_STATUS_TINT;

const QUESTION_STATUS_LABEL: Record<QuestionStatus, string> = {
  completed: "Completed",
  working: "Working now",
  in_progress: "In progress",
  not_started: "Not started",
};

/** The selected student's real lesson progress and code runs, from the teacher aggregate endpoint. */
export default function StudentDetailPanel({
  student,
  online,
  classroomId,
  lessons,
  liveModuleId,
  activity,
  liveAggregate,
}: {
  student: User | null;
  online: boolean;
  classroomId: string;
  lessons: Module[];
  liveModuleId: string | null;
  activity?: StudentActivitySnapshot;
  liveAggregate?: LiveModuleStudentAggregate;
}) {
  const [data, setData] = useState<{
    studentId: string;
    aggregate: TeacherStudentAggregate | null;
  } | null>(null);
  const [liveModule, setLiveModule] = useState<{
    moduleId: string;
    module: TeacherModule | null;
  } | null>(null);
  const studentId = student?.id;

  useEffect(() => {
    if (!studentId || liveModuleId) return;
    let active = true;
    let latestRequest = 0;
    const load = async () => {
      const request = ++latestRequest;
      try {
        const aggregate = await api.getTeacherStudentAggregate(
          classroomId,
          studentId,
        );
        if (active && request === latestRequest)
          setData({ studentId, aggregate });
      } catch {
        if (active && request === latestRequest)
          setData({ studentId, aggregate: null });
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 20000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [classroomId, liveModuleId, studentId]);

  useEffect(() => {
    if (!studentId || !liveModuleId) {
      setLiveModule(null);
      return;
    }
    const controller = new AbortController();
    setLiveModule(null);
    api
      .getModule(liveModuleId, { signal: controller.signal })
      .then((module) => {
        if (!controller.signal.aborted)
          setLiveModule({
            moduleId: liveModuleId,
            module: module as TeacherModule,
          });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setLiveModule({ moduleId: liveModuleId, module: null });
      });
    return () => controller.abort();
  }, [liveModuleId, studentId]);

  const aggregate =
    data && data.studentId === studentId ? data.aggregate : null;
  const loading =
    !!student && !liveModuleId && (!data || data.studentId !== studentId);
  const statusOf = (moduleId: string): ProgressStatus =>
    aggregate?.moduleProgress.find((p) => p.moduleId === moduleId)?.status ??
    "not_started";
  const runs = [...(aggregate?.submissions ?? [])].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const done = lessons.filter((l) => statusOf(l.id) === "completed").length;
  const showingLiveModule = !!student && !!liveModuleId;
  const moduleLoading =
    showingLiveModule && (!liveModule || liveModule.moduleId !== liveModuleId);
  const questions = useMemo(
    () =>
      liveModule?.module?.sections
        .slice()
        .sort((a, b) => a.position - b.position)
        .flatMap((section) =>
          section.questions.slice().sort((a, b) => a.position - b.position),
        ) ?? [],
    [liveModule],
  );

  const questionStatus = (
    question: TeacherModule["sections"][number]["questions"][number],
  ): { status: QuestionStatus; count: number } => {
    const outcome = liveAggregate?.questions.find(
      (item) => item.questionId === question.id,
    );
    const count = outcome?.attemptCount ?? 0;
    if (outcome?.status === "passing") return { status: "completed", count };
    if (
      activity?.active?.moduleId === liveModuleId &&
      activity.active.questionId === question.id
    )
      return { status: "working", count };
    if (outcome?.status === "in_progress" || outcome?.status === "non_passing")
      return { status: "in_progress", count };
    return { status: "not_started", count: 0 };
  };
  return (
    <Card
      title="Student detail"
      icon={<BookIcon className="size-[18px]" />}
      tint="mint"
      className="flex min-h-0 flex-col overflow-hidden lg:h-[32rem]"
      bodyClassName="min-h-0 flex-1 overflow-y-auto p-5"
    >
      {!student ? (
        <p className="m-0 py-4 text-center text-sm text-muted">
          Select a student to see how they’re getting on.
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar name={student.name} id={student.id} size="lg" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Heading as="h3" variant="name" className="truncate">
                {student.name}
              </Heading>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Dot live={online} />
                {online ? "Online now" : "Offline"}
              </span>
            </div>
          </div>

          {loading ? (
            <div
              className="h-24 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none"
              aria-busy="true"
            />
          ) : !aggregate && !showingLiveModule ? (
            <p className="m-0 text-sm text-muted">
              Couldn’t load this student’s work.
            </p>
          ) : showingLiveModule ? (
            moduleLoading ? (
              <div
                className="h-24 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none"
                aria-busy="true"
              />
            ) : !liveModule?.module ? (
              <p className="m-0 text-sm text-muted">
                Couldn’t load the live lesson’s questions.
              </p>
            ) : questions.length === 0 ? (
              <p className="m-0 text-sm text-muted">
                This live lesson has no questions yet.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <p className="m-0 text-sm text-muted">
                  Question progress for the live lesson
                </p>
                <ol className="m-0 flex list-none flex-col p-0">
                  {questions.map((question, index) => {
                    const { status, count } = questionStatus(question);
                    return (
                      <li
                        key={question.id}
                        className="flex items-center justify-between gap-3 border-t border-border py-2 first:border-0"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="m-0 truncate text-[13px] text-ink">
                            {index + 1}. {question.prompt}
                          </p>
                          <p className="m-0 text-xs text-muted">
                            {count === 0
                              ? "No attempts"
                              : plural(count, "attempt")}
                          </p>
                        </div>
                        <span
                          className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${QUESTION_STATUS_TINT[status]}`}
                        >
                          {QUESTION_STATUS_LABEL[status]}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>
            )
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {lessons.length === 0 ? (
                  <p className="m-0 text-sm text-muted">No lessons yet.</p>
                ) : (
                  <>
                    <p className="m-0 text-sm">
                      {done} of {plural(lessons.length, "lesson")} complete
                    </p>
                    <ul className="m-0 flex list-none flex-col p-0">
                      {lessons.map((l) => (
                        <li
                          key={l.id}
                          className="flex items-center justify-between gap-3 border-t border-border py-2 text-[13px] first:border-0"
                        >
                          <span className="min-w-0 truncate">{l.title}</span>
                          <span
                            className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TINT[statusOf(l.id)]}`}
                          >
                            {STATUS_LABEL[statusOf(l.id)]}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {runs.length === 0 ? (
                  <p className="m-0 text-sm text-muted">No code runs yet.</p>
                ) : (
                  <>
                    <p className="m-0 text-sm">
                      {plural(runs.length, "run")} in total, last{" "}
                      {timeAgo(runs[0].createdAt)}
                    </p>
                    <ul className="m-0 flex list-none flex-col p-0">
                      {runs.slice(0, 4).map((run) => (
                        <li
                          key={run.id}
                          className="flex items-center justify-between gap-3 border-t border-border py-2 text-[13px] first:border-0"
                        >
                          <span className="text-muted">
                            {timeAgo(run.createdAt)}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${run.passed === false ? TINT.peach : TINT.mint}`}
                          >
                            {run.passed === false ? "Error" : "Worked"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
