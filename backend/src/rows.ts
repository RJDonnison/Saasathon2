import type { PostgrestError } from "@supabase/supabase-js";
import type {
  Attempt,
  Classroom,
  ClassroomInvitation,
  LessonSession,
  CodeCheck,
  CodeExercise,
  CodeTest,
  CodeSubmission,
  Comment,
  Membership,
  Module,
  ModuleAccess,
  ModuleProgress,
  Question,
  QuestionComment,
  QuestionOption,
  Section,
  SectionItem,
  SectionBlock,
  SectionProgress,
  StudentActivity,
  StudentWork,
  LessonPlanDocument,
  LessonPlanStatus,
  TeacherLessonPlan,
  User,
} from "../../shared/types.js";

export type ClassroomRow = { id: string; name: string };
export type UserRow = { id: string; name: string; email?: string | null };
export type MembershipRow = {
  id: string;
  user_id: string;
  classroom_id: string;
  role: User["role"];
  created_at: string;
};
export type InvitationRow = {
  id: string;
  classroom_id: string;
  email: string;
  student_name: string | null;
  invited_by: string;
  status: ClassroomInvitation["status"];
  user_id: string | null;
  created_at: string;
  responded_at: string | null;
};
export type SessionRow = {
  id: string;
  classroom_id: string;
  module_id: string;
  phase: LessonSession["phase"];
  started_by: string;
  started_at: string;
  ended_at: string | null;
};
export type ModuleRow = {
  id: string;
  classroom_id: string;
  title: string;
  content: string;
  position: number;
  status: "draft" | "published";
  revision: number;
  access: ModuleAccess;
};
export type SectionRow = {
  id: string;
  module_id: string;
  title: string;
  position: number;
};
export type BlockRow = {
  id: string;
  section_id: string;
  type: string;
  content: unknown;
  position: number;
};
export type SectionItemRow = {
  id: string;
  section_id: string;
  item_type: "block" | "question";
  item_id: string;
  position: number;
};
export type QuestionRow = {
  id: string;
  section_id: string;
  prompt: string;
  kind: Question["kind"];
  answer_key: string | null;
  math_expected_result: number | null;
  math_tolerance: number | null;
  position: number;
};
export type OptionRow = {
  id: string;
  question_id: string;
  text: string;
  position: number;
};
export type ExerciseRow = {
  id: string;
  question_id: string;
  language: string;
  starter_code: string;
  instructions: string;
  function_name: string;
  hidden_code: string;
};
export type TestRow = {
  id: string;
  code_exercise_id: string;
  name: string;
  args: unknown;
  expected: unknown;
  position: number;
};
export type CheckRow = {
  id: string;
  code_exercise_id: string;
  name: string;
  description: string;
  position: number;
};
export type ModuleProgressRow = {
  id: string;
  student_id: string;
  module_id: string;
  status: ModuleProgress["status"];
  updated_at: string;
};
export type SectionProgressRow = {
  id: string;
  student_id: string;
  section_id: string;
  status: SectionProgress["status"];
  updated_at: string;
};
export type CommentRow = {
  id: string;
  submission_id: string;
  author_id: string;
  text: string;
  line_start: number | null;
  line_end: number | null;
  created_at: string;
};
export type QuestionCommentRow = {
  id: string;
  question_id: string;
  student_id: string;
  author_id: string;
  text: string;
  created_at: string;
};
export type AttemptRow = {
  id: string;
  student_id: string;
  question_id: string;
  answer: string;
  is_correct: boolean | null;
  created_at: string;
};
export type CodeSubmissionRow = {
  id: string;
  student_id: string;
  code_exercise_id: string;
  code: string;
  stdout: string;
  stderr: string;
  passed: boolean | null;
  created_at: string;
};
export type StudentWorkRow = {
  id: string;
  student_id: string;
  question_id: string;
  answer: string | null;
  code: string | null;
  is_correct: boolean | null;
  checked_at: string | null;
  updated_at: string;
};
export type StudentActivityRow = {
  id: string;
  student_id: string;
  classroom_id: string;
  module_id: string;
  section_id: string | null;
  question_id: string | null;
  type: StudentActivity["type"];
  created_at: string;
};
export type TeacherLessonPlanRow = {
  id: string;
  classroom_id: string;
  teacher_id: string;
  module_id: string | null;
  document: LessonPlanDocument;
  status: LessonPlanStatus;
  lesson_date: string | null;
  taught_at: string | null;
  created_at: string;
  updated_at: string;
};

const iso = (value: string) => new Date(value).toISOString();
export const toClassroom = (
  r: ClassroomRow,
  teacherName: string | null = null,
): Classroom => ({
  id: r.id,
  name: r.name,
  teacherName,
});
export const toTeacherLessonPlan = (
  r: TeacherLessonPlanRow,
  classroomName: string,
): TeacherLessonPlan => ({
  id: r.id,
  classroomId: r.classroom_id,
  classroomName,
  teacherId: r.teacher_id,
  moduleId: r.module_id,
  document: r.document,
  status: r.status,
  lessonDate: r.lesson_date,
  taughtAt: r.taught_at,
  createdAt: iso(r.created_at),
  updatedAt: iso(r.updated_at),
});
export const toMembership = (r: MembershipRow): Membership => ({
  id: r.id,
  userId: r.user_id,
  classroomId: r.classroom_id,
  role: r.role,
  createdAt: iso(r.created_at),
});
export const toUser = (u: UserRow, m: MembershipRow): User => ({
  id: u.id,
  name: u.name,
  role: m.role,
  classroomId: m.classroom_id,
  membershipId: m.id,
});
export const toInvitation = (r: InvitationRow): ClassroomInvitation => ({
  id: r.id,
  classroomId: r.classroom_id,
  email: r.email,
  studentName: r.student_name,
  status: r.status,
  createdAt: r.created_at,
  respondedAt: r.responded_at,
});
export const toSession = (
  r: SessionRow,
  moduleTitle: string,
): LessonSession => ({
  id: r.id,
  classroomId: r.classroom_id,
  moduleId: r.module_id,
  moduleTitle,
  phase: r.phase,
  startedAt: r.started_at,
});
export const toModule = (r: ModuleRow): Module => ({
  id: r.id,
  classroomId: r.classroom_id,
  title: r.title,
  content: r.content,
  position: r.position,
  status: r.status,
  revision: r.revision,
  access: r.access ?? "anytime",
});
export const toSection = (r: SectionRow): Section => ({
  id: r.id,
  moduleId: r.module_id,
  title: r.title,
  position: r.position,
});
export const toBlock = (r: BlockRow): SectionBlock => ({
  id: r.id,
  sectionId: r.section_id,
  type: r.type,
  content: r.content,
  position: r.position,
});
export const toSectionItem = (r: SectionItemRow): SectionItem => ({
  id: r.id,
  sectionId: r.section_id,
  itemType: r.item_type,
  itemId: r.item_id,
  position: r.position,
});
export const toOption = (r: OptionRow): QuestionOption => ({
  id: r.id,
  questionId: r.question_id,
  text: r.text,
  position: r.position,
});
export const toQuestion = (r: QuestionRow): Question => ({
  id: r.id,
  sectionId: r.section_id,
  prompt: r.prompt,
  kind: r.kind,
  position: r.position,
  options: [],
});
export const toExercise = (r: ExerciseRow): CodeExercise => ({
  id: r.id,
  questionId: r.question_id,
  language: r.language,
  starterCode: r.starter_code,
  instructions: r.instructions,
  functionName: r.function_name,
});
export const toTest = (r: TestRow): CodeTest => ({
  id: r.id,
  codeExerciseId: r.code_exercise_id,
  name: r.name,
  args: r.args as unknown[],
  expected: r.expected,
  position: r.position,
});
export const toCheck = (r: CheckRow): CodeCheck => ({
  id: r.id,
  codeExerciseId: r.code_exercise_id,
  name: r.name,
  description: r.description,
  position: r.position,
});
export const toModuleProgress = (r: ModuleProgressRow): ModuleProgress => ({
  id: r.id,
  studentId: r.student_id,
  moduleId: r.module_id,
  status: r.status,
  updatedAt: iso(r.updated_at),
});
export const toSectionProgress = (r: SectionProgressRow): SectionProgress => ({
  id: r.id,
  studentId: r.student_id,
  sectionId: r.section_id,
  status: r.status,
  updatedAt: iso(r.updated_at),
});
export const toComment = (r: CommentRow): Comment => ({
  id: r.id,
  submissionId: r.submission_id,
  authorId: r.author_id,
  text: r.text,
  lineStart: r.line_start,
  lineEnd: r.line_end,
  createdAt: iso(r.created_at),
});
export const toQuestionComment = (r: QuestionCommentRow): QuestionComment => ({
  id: r.id,
  questionId: r.question_id,
  studentId: r.student_id,
  authorId: r.author_id,
  text: r.text,
  createdAt: iso(r.created_at),
});
export const toAttempt = (r: AttemptRow): Attempt => ({
  id: r.id,
  studentId: r.student_id,
  questionId: r.question_id,
  answer: r.answer,
  isCorrect: r.is_correct,
  createdAt: iso(r.created_at),
});
export const toSubmission = (r: CodeSubmissionRow): CodeSubmission => ({
  id: r.id,
  studentId: r.student_id,
  codeExerciseId: r.code_exercise_id,
  code: r.code,
  stdout: r.stdout,
  stderr: r.stderr,
  passed: r.passed,
  createdAt: iso(r.created_at),
});
export const toStudentWork = (r: StudentWorkRow): StudentWork => ({
  id: r.id,
  studentId: r.student_id,
  questionId: r.question_id,
  answer: r.answer,
  code: r.code,
  isCorrect: r.is_correct,
  checkedAt: r.checked_at ? iso(r.checked_at) : null,
  updatedAt: iso(r.updated_at),
});
export const toStudentActivity = (r: StudentActivityRow): StudentActivity => ({
  id: r.id,
  studentId: r.student_id,
  classroomId: r.classroom_id,
  moduleId: r.module_id,
  sectionId: r.section_id,
  questionId: r.question_id,
  type: r.type,
  createdAt: iso(r.created_at),
});
export function unwrap<T>(res: { data: T; error: PostgrestError | null }): T {
  if (res.error) throw res.error;
  return res.data;
}
