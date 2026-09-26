import { supabase } from "./supabase.js";
import { unwrap } from "./rows.js";
import type {
  LiveModuleStudentAggregate,
  LiveQuestionOutcome,
} from "../../shared/types.js";

type QuestionRow = { id: string; kind: "mcq" | "short" | "code" | "math" };
type AttemptRow = {
  id: string;
  student_id: string;
  question_id: string;
  is_correct: boolean | null;
  created_at: string;
};
type WorkRow = {
  student_id: string;
  question_id: string;
  is_correct: boolean | null;
  checked_at: string | null;
};
type ExerciseRow = { id: string; question_id: string };
type SubmissionRow = {
  id: string;
  student_id: string;
  code_exercise_id: string;
  passed: boolean | null;
  created_at: string;
  graded_at: string | null;
};

const latest = <T extends { created_at: string; id: string }>(rows: T[]) =>
  rows
    .slice()
    .sort(
      (a, b) =>
        b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id),
    )[0];

/**
 * Recomputes completion from the module's current questions. It deliberately does
 * not consult module_progress: completion is never persisted as a derived state.
 */
export async function liveModuleAggregates(
  moduleId: string,
  studentIds: string[],
): Promise<LiveModuleStudentAggregate[]> {
  const sections = unwrap(
    await supabase.from("sections").select("id").eq("module_id", moduleId),
  ) as Array<{ id: string }>;
  const sectionIds = sections.map((section) => section.id);
  const questions = sectionIds.length
    ? (unwrap(
        await supabase
          .from("questions")
          .select("id,kind")
          .in("section_id", sectionIds),
      ) as QuestionRow[])
    : [];
  const questionIds = questions.map((question) => question.id);
  const exercises = questionIds.length
    ? (unwrap(
        await supabase
          .from("code_exercises")
          .select("id,question_id")
          .in("question_id", questionIds),
      ) as ExerciseRow[])
    : [];
  const exerciseIds = exercises.map((exercise) => exercise.id);
  const [attemptResponse, workResponse, submissionResponse] = await Promise.all(
    [
      questionIds.length && studentIds.length
        ? supabase
            .from("attempts")
            .select("id,student_id,question_id,is_correct,created_at")
            .in("question_id", questionIds)
            .in("student_id", studentIds)
        : Promise.resolve({ data: [], error: null }),
      questionIds.length && studentIds.length
        ? supabase
            .from("student_work")
            .select("student_id,question_id,is_correct,checked_at")
            .in("question_id", questionIds)
            .in("student_id", studentIds)
        : Promise.resolve({ data: [], error: null }),
      exerciseIds.length && studentIds.length
        ? supabase
            .from("code_submissions")
            .select(
              "id,student_id,code_exercise_id,passed,created_at,graded_at",
            )
            .in("code_exercise_id", exerciseIds)
            .in("student_id", studentIds)
            .not("graded_at", "is", null)
        : Promise.resolve({ data: [], error: null }),
    ],
  );
  const attempts = unwrap(attemptResponse) as AttemptRow[];
  const work = unwrap(workResponse) as WorkRow[];
  const submissions = unwrap(submissionResponse) as SubmissionRow[];
  const exerciseByQuestion = new Map(
    exercises.map((exercise) => [exercise.question_id, exercise.id]),
  );

  return studentIds.map((studentId) => {
    const outcomes: LiveQuestionOutcome[] = questions.map((question) => {
      if (question.kind === "code") {
        const exerciseId = exerciseByQuestion.get(question.id);
        const rows = submissions.filter(
          (row) =>
            row.student_id === studentId && row.code_exercise_id === exerciseId,
        );
        const result = latest(rows);
        return {
          questionId: question.id,
          attemptCount: rows.length,
          status: !result
            ? "not_started"
            : result.passed === true
              ? "passing"
              : "non_passing",
        };
      }
      if (question.kind === "math") {
        const result = work.find(
          (row) =>
            row.student_id === studentId && row.question_id === question.id,
        );
        return {
          questionId: question.id,
          attemptCount: result?.checked_at ? 1 : 0,
          status: !result
            ? "not_started"
            : !result.checked_at
              ? "in_progress"
              : result.is_correct === true
                ? "passing"
                : "non_passing",
        };
      }
      const rows = attempts.filter(
        (row) =>
          row.student_id === studentId && row.question_id === question.id,
      );
      const result = latest(rows);
      return {
        questionId: question.id,
        attemptCount: rows.length,
        status: !result
          ? "not_started"
          : result.is_correct === true
            ? "passing"
            : "non_passing",
      };
    });
    return {
      studentId,
      questions: outcomes,
      completed:
        outcomes.length > 0 &&
        outcomes.every((outcome) => outcome.status === "passing"),
    };
  });
}

export async function liveModuleStudentAggregate(
  moduleId: string,
  studentId: string,
) {
  return (await liveModuleAggregates(moduleId, [studentId]))[0];
}
