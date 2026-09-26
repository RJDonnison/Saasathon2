import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import { onStudentActivityUpdate } from "../socket.ts";
import Card from "../ui/Card.tsx";
import Heading from "../ui/Heading.tsx";
import InlineText from "../ui/InlineText.tsx";
import MathText from "../ui/MathText.tsx";
import QuestionConversation from "../ui/QuestionConversation.tsx";
import { BookIcon, CodeIcon, PencilIcon } from "../ui/icons.tsx";
import { TINT } from "../ui/styles.ts";
import type {
  StudentActivity,
  StudentWork,
  TeacherModule,
  TeacherQuestion,
} from "../../../shared/types";

const activityLabel: Record<StudentActivity["type"], string> = {
  viewing_lesson: "Viewing the lesson",
  answering_question: "Answering this question",
  checking_answer: "Checking their answer",
  writing_code: "Writing code",
  running_code: "Running code",
  checking_code: "Checking code",
};

/** A teacher-only, read-only view of the live draft behind a student's current activity. */
export default function StudentWorkView() {
  const { user } = useAuth();
  const { studentId, moduleId } = useParams();
  const [searchParams] = useSearchParams();
  const [module, setModule] = useState<TeacherModule | null>(null);
  const [studentName, setStudentName] = useState("Student");
  const [work, setWork] = useState<StudentWork[]>([]);
  const [active, setActive] = useState<StudentActivity | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !studentId || !moduleId) return;
    let cancelled = false;
    Promise.all([
      api.getModule(moduleId),
      api.getTeacherStudentAggregate(user.classroomId, studentId),
      api.getStudents(user.classroomId),
      api.getClassroomStudentActivity(user.classroomId),
    ])
      .then(([lesson, aggregate, students, snapshots]) => {
        if (cancelled) return;
        setModule(lesson as TeacherModule);
        setWork(aggregate.work);
        setStudentName(students.find((student) => student.id === studentId)?.name ?? "Student");
        setActive(snapshots.find((snapshot) => snapshot.studentId === studentId)?.active ?? null);
      })
      .catch((reason) => {
        if (!cancelled)
          setError(reason instanceof Error ? reason.message : "Could not load student work");
      });
    return () => {
      cancelled = true;
    };
  }, [moduleId, studentId, user]);

  useEffect(
    () =>
      onStudentActivityUpdate((update) => {
        if (!user || update.classroomId !== user.classroomId || update.studentId !== studentId) return;
        setActive(update.active);
        if (update.work)
          setWork((current) => [
            update.work!,
            ...current.filter((entry) => entry.questionId !== update.work!.questionId),
          ]);
      }),
    [studentId, user],
  );

  const questionId = active?.questionId ?? searchParams.get("questionId");
  const question = useMemo<TeacherQuestion | null>(() => {
    if (!module || !questionId) return null;
    return (
      module.sections
        .flatMap((section) => section.questions)
        .find((item) => item.id === questionId) ?? null
    );
  }, [module, questionId]);
  const draft = question ? work.find((entry) => entry.questionId === question.id) : null;
  const isCode = question?.kind === "code";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Heading as="h1" variant="title">{studentName}'s workspace</Heading>
          <p className="m-0 text-[15px] text-muted">
            This is read-only and updates when the student saves more work.
          </p>
        </div>
        <Link to={`/teacher/class/${user?.classroomId ?? ""}`} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm! font-semibold! text-ink hover:bg-surface-soft">
          Back to dashboard
        </Link>
      </div>

      {error && <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>{error}</p>}

      {!module && !error && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading student work">
          <div className="h-32 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
          <div className="h-80 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
        </div>
      )}

      {module && !question && (
        <Card title="No active question" icon={<BookIcon className="size-[18px]" />} tint="mint" bodyClassName="p-5">
          <p className="m-0 text-sm text-muted">This student is not currently working on a question in this lesson.</p>
        </Card>
      )}

      {question && (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <Card
            title={isCode ? "Code exercise" : "Question"}
            icon={isCode ? <CodeIcon className="size-[18px]" /> : <PencilIcon className="size-[18px]" />}
            tint={isCode ? "mint" : "peach"}
            bodyClassName="flex flex-col gap-5 p-5 sm:p-6"
          >
            <p className="m-0! text-[16px] leading-relaxed text-ink">
              {question.kind === "math" ? <MathText text={question.prompt} /> : <InlineText text={question.prompt} />}
            </p>
            {isCode && question.codeExercise?.instructions && (
              <p className="m-0 text-sm leading-relaxed text-muted">{question.codeExercise.instructions}</p>
            )}
            <div className="flex flex-col gap-2">
              {draft ? (
                isCode ? (
                  <pre className="m-0 max-h-[34rem] overflow-auto rounded-xl border border-border bg-surface-soft p-4 text-[13px] leading-6 whitespace-pre text-ink font-mono">
                    {draft.code ?? ""}
                  </pre>
                ) : (
                  <p className="m-0 rounded-xl border border-border bg-surface-soft px-4 py-3 text-sm leading-relaxed text-ink">
                    {draft.answer || "No answer entered yet."}
                  </p>
                )
              ) : (
                <p className="m-0 rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted">No draft saved yet.</p>
              )}
            </div>
            {studentId && <QuestionConversation questionId={question.id} studentId={studentId} />}
          </Card>

          <Card title="Live status" tint="lavender" bodyClassName="flex flex-col gap-3 p-5">
            <p className="m-0 text-sm font-medium text-ink">
              {active ? activityLabel[active.type] : "No live update yet"}
            </p>
            {active && <p className="m-0 text-xs text-muted">Updated {new Date(active.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</p>}
            <Link to={`/teacher/class/${user?.classroomId ?? ""}`} className="inline-flex self-start rounded-xl bg-accent px-3 py-2 text-sm! font-semibold! text-white">
              Return to dashboard
            </Link>
          </Card>
        </div>
      )}
    </div>
  );
}
