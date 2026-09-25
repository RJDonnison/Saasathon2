// Single source of truth for entities and REST contracts.
export type Role = "student" | "teacher";
export type ProgressStatus = "not_started" | "in_progress" | "completed";
export type QuestionKind = "mcq" | "short" | "code";

export interface Classroom {
  id: string;
  name: string;
  roomCode: string;
}
/** A user projected into the currently selected classroom for auth compatibility. */
export interface User {
  id: string;
  name: string;
  role: Role;
  classroomId: string;
  membershipId: string;
}
export interface Membership {
  id: string;
  userId: string;
  classroomId: string;
  role: Role;
  createdAt: string;
}

export interface Module {
  id: string;
  classroomId: string;
  title: string;
  content: string;
  position: number;
}
export interface Section {
  id: string;
  moduleId: string;
  title: string;
  position: number;
}
export interface SectionBlock {
  id: string;
  sectionId: string;
  type: string;
  content: unknown;
  position: number;
}
export interface QuestionOption {
  id: string;
  questionId: string;
  text: string;
  position: number;
}
export interface Question {
  id: string;
  sectionId: string;
  prompt: string;
  kind: QuestionKind;
  position: number;
  options: QuestionOption[];
}
export interface CodeExercise {
  id: string;
  questionId: string;
  language: string;
  starterCode: string;
  instructions: string;
}
export interface ReferenceAnswer {
  id: string;
  codeExerciseId: string;
  title: string;
  answer: string;
  position: number;
}
export interface CodeCheck {
  id: string;
  codeExerciseId: string;
  name: string;
  description: string;
  position: number;
}

/** Teacher aggregate. Includes answer keys, reference answers and checks. */
export interface TeacherQuestion extends Question {
  answerKey: string | null;
  codeExercise?: CodeExercise & {
    referenceAnswers: ReferenceAnswer[];
    checks: CodeCheck[];
  };
}
export interface TeacherSection extends Section {
  blocks: SectionBlock[];
  questions: TeacherQuestion[];
}
export interface TeacherModule extends Module {
  sections: TeacherSection[];
}
/** Student aggregate. Deliberately excludes answer keys, reference answers and checks. */
export interface StudentQuestion extends Question {
  codeExercise?: CodeExercise;
}
export interface StudentSection extends Section {
  blocks: SectionBlock[];
  questions: StudentQuestion[];
}
export interface StudentModule extends Module {
  sections: StudentSection[];
}

export interface ModuleProgress {
  id: string;
  studentId: string;
  moduleId: string;
  status: ProgressStatus;
  updatedAt: string;
}
export interface SectionProgress {
  id: string;
  studentId: string;
  sectionId: string;
  status: ProgressStatus;
  updatedAt: string;
}
/** Legacy name retained for existing clients. */
export type ProgressRecord = ModuleProgress;
export interface Attempt {
  id: string;
  studentId: string;
  questionId: string;
  answer: string;
  isCorrect: boolean | null;
  createdAt: string;
}
export interface CodeSubmission {
  id: string;
  studentId: string;
  codeExerciseId: string;
  code: string;
  stdout: string;
  stderr: string;
  passed: boolean | null;
  createdAt: string;
}
export interface Comment {
  id: string;
  submissionId: string;
  authorId: string;
  text: string;
  lineStart: number | null;
  lineEnd: number | null;
  createdAt: string;
}
export interface TeacherStudentAggregate {
  studentId: string;
  moduleProgress: ModuleProgress[];
  sectionProgress: SectionProgress[];
  attempts: Attempt[];
  submissions: CodeSubmission[];
  comments: Comment[];
}

// ---------- REST contracts ----------

/**
 * Auth is Supabase Auth (Google OAuth) in the browser. Every /api request carries the Supabase access
 * token as `Authorization: Bearer <access_token>`; the backend never issues its own tokens.
 */

/**
 * POST /api/auth/join (signed in, not yet in a classroom — or switching classroom/role)
 * The user's name comes from their Google profile. Their User.id is their Supabase auth user id.
 */
export interface JoinRequest {
  roomCode: string;
  role: Role;
}
export interface JoinResponse {
  user: User;
}
/** GET /api/auth/me (signed in) — `user` is null until they have joined a classroom. */
export interface MeResponse {
  user: User | null;
}

export interface CreateClassroomRequest {
  name: string;
  roomCode: string;
}
export interface CreateModuleRequest {
  title: string;
  content?: string;
  position?: number;
}
export interface UpdateModuleRequest {
  title?: string;
  content?: string;
  position?: number;
}
export interface CreateSectionRequest {
  title: string;
  position?: number;
}
export interface UpdateSectionRequest {
  title?: string;
  position?: number;
}
export interface CreateBlockRequest {
  type: string;
  content: unknown;
  position?: number;
}
export interface UpdateBlockRequest {
  type?: string;
  content?: unknown;
  position?: number;
}
export interface CreateQuestionRequest {
  prompt: string;
  kind: QuestionKind;
  answerKey?: string | null;
  position?: number;
}
export interface UpdateQuestionRequest {
  prompt?: string;
  kind?: QuestionKind;
  answerKey?: string | null;
  position?: number;
}
export interface CreateOptionRequest {
  text: string;
  position?: number;
}
export interface UpdateOptionRequest {
  text?: string;
  position?: number;
}
export interface UpsertCodeExerciseRequest {
  language: string;
  starterCode: string;
  instructions: string;
}
export interface CreateReferenceAnswerRequest {
  title: string;
  answer: string;
  position?: number;
}
export interface UpdateReferenceAnswerRequest {
  title?: string;
  answer?: string;
  position?: number;
}
export interface CreateCodeCheckRequest {
  name: string;
  description: string;
  position?: number;
}
export interface UpdateCodeCheckRequest {
  name?: string;
  description?: string;
  position?: number;
}

export interface UpsertModuleProgressRequest {
  studentId?: string;
  moduleId: string;
  status: ProgressStatus;
}
export interface UpsertSectionProgressRequest {
  studentId?: string;
  sectionId: string;
  status: ProgressStatus;
}
export interface CreateAttemptRequest {
  questionId: string;
  answer: string;
}
/** The caller/sandbox supplies execution results; this API never executes code. */
export interface CreateSubmissionRequest {
  codeExerciseId: string;
  code: string;
  stdout?: string;
  stderr?: string;
  passed?: boolean | null;
}
export interface CreateCommentRequest {
  submissionId: string;
  text: string;
  lineStart?: number | null;
  lineEnd?: number | null;
}

export type GetModuleResponse = StudentModule | TeacherModule;
export type ListModulesResponse = Module[];
export type GetClassroomResponse = Classroom;
export type GetClassroomStudentsResponse = User[];
export type GetStudentProgressResponse = ModuleProgress[];
export type UpsertProgressRequest = UpsertModuleProgressRequest;
export type UpsertProgressResponse = ModuleProgress;
export type CreateCommentResponse = Comment;
export type CreateAttemptResponse = Attempt;
export type CreateSubmissionResponse = CodeSubmission;
export type ListSubmissionCommentsResponse = Comment[];
export type GetTeacherStudentAggregateResponse = TeacherStudentAggregate;

/** POST /api/code/run remains mocked; it never executes supplied code. */
export interface RunCodeRequest {
  code: string;
  language: string;
}
export interface RunCodeResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}
/** One turn of an AI conversation. The AI endpoints are stateless: the client re-sends the transcript each call. */
export interface AiChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * POST /api/ai/hint (student only) — "I'm stuck" tutor. Gives hints, never the solution, scoped to `moduleId`.
 * The server loads the module itself (student-safe view: no answer keys/reference answers/checks).
 * Limits: question <= 2000 chars, history <= 20 turns of <= 2000 chars, code <= 8000 chars.
 * Errors: 503 if the server has no OPENAI_API_KEY, 502 if OpenAI fails, 429 if rate limited.
 */
export interface AiHintRequest {
  moduleId: string;
  /** Must be the caller's own id. */
  studentId: string;
  question: string;
  /** Earlier turns of this chat, oldest first (not including `question`). */
  history?: AiChatMessage[];
  /** The student's current code, if relevant to the question. */
  code?: string;
}
export interface AiHintResponse {
  reply: string;
}

/**
 * POST /api/ai/draft (teacher only, stretch) — helps draft or plan modules. Replies in Markdown.
 * `moduleId` supplies the saved module as context (including answer keys — it's the teacher's own material);
 * `draft` is optional in-progress text not yet saved. Same limits/errors as /api/ai/hint (request <= 4000, draft <= 20000).
 */
export interface AiDraftRequest {
  request: string;
  moduleId?: string;
  draft?: string;
  history?: AiChatMessage[];
}
export interface AiDraftResponse {
  reply: string;
}
export interface ApiError {
  error: string;
}
