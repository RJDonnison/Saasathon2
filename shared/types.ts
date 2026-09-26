// Single source of truth for entities and REST contracts.
export type Role = "student" | "teacher";
export type ProgressStatus = "not_started" | "in_progress" | "completed";
export type QuestionKind = "mcq" | "short" | "code" | "math";
export type ModuleStatus = "draft" | "published";

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
  status: ModuleStatus;
  revision: number;
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
/** The authoritative, mixed ordering for a section. Legacy blocks/questions remain for compatibility. */
export interface SectionItem {
  id: string;
  sectionId: string;
  itemType: "block" | "question";
  itemId: string;
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
  /** The synchronous named function automated checks invoke. */
  functionName: string;
}
/** Teacher-only structured, JSON-safe automated case. Never included in StudentModule. */
export interface CodeTest {
  id: string;
  codeExerciseId: string;
  name: string;
  args: unknown[];
  expected: unknown;
  position: number;
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
  /** Teacher-only target values; student aggregates deliberately omit both fields. */
  mathExpectedResult: number | null;
  mathTolerance: number | null;
  codeExercise?: CodeExercise & {
    /** Appended by the server at run time; deliberately absent from student aggregates. */
    hiddenCode: string;
    referenceAnswers: ReferenceAnswer[];
    checks: CodeCheck[];
    tests: CodeTest[];
  };
}
export interface TeacherSection extends Section {
  blocks: SectionBlock[];
  questions: TeacherQuestion[];
  items: SectionItem[];
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
  items: SectionItem[];
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
/** A student's latest saved draft for a question. Code and text answers share one row because a question has one kind. */
export interface StudentWork {
  id: string;
  studentId: string;
  questionId: string;
  answer: string | null;
  code: string | null;
  updatedAt: string;
}
export type StudentActivityType =
  | "viewing_lesson"
  | "answering_question"
  | "checking_answer"
  | "writing_code"
  | "running_code"
  | "checking_code";
/** A meaningful, timestamped learning action shown in the teacher dashboard. */
export interface StudentActivity {
  id: string;
  studentId: string;
  classroomId: string;
  moduleId: string;
  sectionId: string | null;
  questionId: string | null;
  type: StudentActivityType;
  createdAt: string;
}
/** The teacher's live view of one student, including a short persisted activity trail. */
export interface StudentActivitySnapshot {
  studentId: string;
  active: StudentActivity | null;
  recent: StudentActivity[];
  work: StudentWork[];
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
  work: StudentWork[];
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
/** Complete editor document. Save is serialized by `revision`; the server replaces this module only. */
export interface ModuleBuilderDocument {
  title: string;
  content: string;
  status: ModuleStatus;
  sections: Array<{
    id: string;
    title: string;
    items: Array<
      | { id: string; type: "block"; blockType: string; content: unknown }
      | {
          id: string;
          type: "question";
          prompt: string;
          kind: QuestionKind;
          answerKey: string | null;
          mathExpectedResult?: number | null;
          mathTolerance?: number | null;
          options: string[];
          language?: string;
          starterCode?: string;
          instructions?: string;
          /** Named function used by teacher-configured automated checks. */
          functionName?: string;
          /** Teacher-only test harness appended on the server when this exercise runs. */
          hiddenCode?: string;
          referenceAnswers?: Array<{
            id: string;
            title: string;
            answer: string;
          }>;
          checks?: Array<{ id: string; name: string; description: string }>;
        }
    >;
  }>;
}
export interface SaveModuleBuilderRequest {
  revision: number;
  document: ModuleBuilderDocument;
}
export interface SaveModuleBuilderResponse {
  module: TeacherModule;
}
/**
 * A teacher-only builder suggestion. `document` is a complete, reviewable replacement for the
 * in-progress builder document, so it can add reading blocks and questions as well as edit text.
 * It is omitted when the assistant is only giving advice.
 */
export interface AiModuleSuggestion {
  id: string;
  label: string;
  reply: string;
  document?: ModuleBuilderDocument;
}
export interface AiModuleSuggestionsRequest {
  request: string;
  /** The teacher's current, possibly unsaved builder state. It is the source for any replacement. */
  document: ModuleBuilderDocument;
  /** The lesson item the teacher has selected for focused help, if any. */
  selectedItemId?: string;
}
export interface AiModuleSuggestionsResponse {
  suggestions: AiModuleSuggestion[];
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
  mathExpectedResult?: number | null;
  mathTolerance?: number | null;
  position?: number;
}
export interface UpdateQuestionRequest {
  prompt?: string;
  kind?: QuestionKind;
  answerKey?: string | null;
  mathExpectedResult?: number | null;
  mathTolerance?: number | null;
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
  functionName: string;
  hiddenCode?: string;
}
export interface UpdateCodeExerciseRequest {
  functionName: string;
}
export interface CreateCodeTestRequest {
  name: string;
  args: unknown[];
  expected: unknown;
  position?: number;
}
export interface UpdateCodeTestRequest {
  name?: string;
  args?: unknown[];
  expected?: unknown;
  position?: number;
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
/** Saves a text/math response or code draft while the student works. */
export interface SaveStudentWorkRequest {
  moduleId: string;
  sectionId: string;
  questionId: string;
  kind: "answer" | "code";
  value: string;
}
/** Records a meaningful learning action and updates the student's current location. */
export interface RecordStudentActivityRequest {
  moduleId: string;
  sectionId?: string;
  questionId?: string;
  type: StudentActivityType;
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
export type GetClassroomStudentActivityResponse = StudentActivitySnapshot[];
export type GetStudentWorkResponse = StudentWork[];

/** POST /api/code/run executes a supported lesson language in the server-configured Piston sandbox. */
export interface RunCodeRequest {
  code: string;
  language: string;
  /** A lesson exercise whose teacher-only harness is loaded server-side. Omit for the playground. */
  exerciseId?: string;
}
export interface RunCodeResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}
/** POST /api/code/grade; inputs and expected values are intentionally never returned. */
export interface GradeCodeExerciseRequest {
  exerciseId: string;
  code: string;
}
export interface GradeCodeExerciseResponse {
  passed: boolean;
  /** Named check outcomes, without test inputs, expected values, or diagnostics. */
  results?: GradeCodeTestResult[];
  /** A generic configuration or execution message, never test implementation detail. */
  error?: string;
}
export interface GradeCodeTestResult {
  name: string;
  passed: boolean;
}
/** POST /api/math/validate. The expected result and tolerance are never returned. */
export interface ValidateMathRequest {
  questionId: string;
  expression: string;
}
export interface ValidateMathResponse {
  value: number;
  isCorrect: boolean;
}
/** One turn of an AI conversation. The AI endpoints are stateless: the client re-sends the transcript each call. */
export interface AiChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * POST /api/ai/hint (student only) — "I'm stuck" tutor. Gives hints, never the solution, scoped to `moduleId`.
 * The server loads the module itself (student-safe view: no answer keys/reference answers/checks).
 * Limits: question <= 2000 chars, history <= 20 turns of <= 2000 chars, code <= 8000 chars, error <= 2000 chars.
 * Errors: 503 if the server has no OPENAI_API_KEY, 502 if OpenAI fails, 429 if rate limited.
 * When `code` is sent and the tutor can point at the problem (a syntax error, a crash), the response carries a
 * `highlight` so the editor can mark and scroll to that spot. It only locates the problem; it never fixes it.
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
  /** The code exercise `code` belongs to (must be in `moduleId`); lets the tutor see the task they are on. */
  exerciseId?: string;
  /** The math question the student is viewing; the server resolves its prompt from `moduleId`. */
  questionId?: string;
  /** Output (stderr / message) from the student's last failed run of `code`. */
  error?: string;
}
/** A spot in the submitted `code` for the editor to mark and scroll to. Lines are 1-based and inclusive. */
export interface AiCodeHighlight {
  line: number;
  endLine?: number;
  /** Short, hint-style note (what to look at, not the fix). */
  note: string;
}
export interface AiHintResponse {
  reply: string;
  /** Present only when `code` was sent and the tutor located a specific problem in it. */
  highlight?: AiCodeHighlight;
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
/** POST /api/ai/code-test-candidates (teacher only). Candidates are editable and not persisted. */
export interface AiCodeTestCandidatesRequest {
  exerciseId: string;
  request: string;
}
export interface AiCodeTestCandidate {
  functionName: string;
  args: unknown[];
  expected: unknown;
}
export interface AiCodeTestCandidatesResponse {
  candidates: AiCodeTestCandidate[];
}
export interface ApiError {
  error: string;
}
