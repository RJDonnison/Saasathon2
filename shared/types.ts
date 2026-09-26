// Single source of truth for entities and REST contracts.
export type Role = "student" | "teacher";
export type ProgressStatus = "not_started" | "in_progress" | "completed";
export type QuestionKind = "mcq" | "short" | "code" | "math";
export type ModuleStatus = "draft" | "published";

export interface Classroom {
  id: string;
  name: string;
  /** The classroom's first teacher, for display; null if it has none. */
  teacherName: string | null;
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
export type InvitationStatus = "pending" | "accepted" | "declined";
/** Teacher's view of an invitation. Nobody is enrolled until the invited student accepts. */
export interface ClassroomInvitation {
  id: string;
  classroomId: string;
  email: string;
  studentName: string | null;
  status: InvitationStatus;
  createdAt: string;
  respondedAt: string | null;
}
/** Student's view of a pending invitation addressed to their Google email. */
export interface MyInvitation {
  id: string;
  classroomId: string;
  classroomName: string;
  invitedByName: string;
  createdAt: string;
}
export interface CreateClassroomInvitationsRequest {
  students: Array<{ email: string; name?: string }>;
}
export interface CreateClassroomInvitationsResponse {
  invitations: ClassroomInvitation[];
  /** Emails not invited because they already belong to the classroom. */
  skipped: string[];
}
export type ListClassroomInvitationsResponse = ClassroomInvitation[];
/** GET /api/invitations (signed in, no classroom needed) — pending invitations for the caller's Google email. */
export type ListMyInvitationsResponse = MyInvitation[];
/**
 * POST /api/invitations/:id/accept enrols the caller as a student and makes that classroom their active one.
 * POST /api/invitations/:id/decline returns 204. Both are 404 unless the invitation is pending and addressed
 * to the caller's email.
 */
export interface AcceptInvitationResponse {
  user: User;
}

/** Teach = follow the teacher (helper paused); work = students work on their own with the helper. */
export type LessonPhase = "teach" | "work";
/**
 * A live lesson: the teacher has started a lesson for the class. While one is live, students who follow it see the
 * lesson and phase the teacher chose. At most one per classroom.
 */
export interface LessonSession {
  id: string;
  classroomId: string;
  moduleId: string;
  moduleTitle: string;
  phase: LessonPhase;
  startedAt: string;
}

export type LessonFeedbackFlag =
  | "answer_seeking"
  | "harassment"
  | "violence"
  | "self_harm"
  | "sexual"
  | "abusive_language"
  | "cyber_abuse";
export type LessonFeedbackSafetyFlag = Exclude<LessonFeedbackFlag, "answer_seeking">;
export interface LessonFeedbackStudentSummary {
  studentId: string;
  studentName: string;
  progress: ProgressStatus;
  finishedAt: string | null;
  activeMinutes: number;
  aiHintCount: number;
  trackedActionCount: number;
  aiUsePercent: number;
  usedHelper: boolean;
  followedPercent: number;
  detachCount: number;
  taskCount: number;
  quizCount: number;
  safetyFlags: LessonFeedbackSafetyFlag[];
  flags: LessonFeedbackFlag[];
  aiSummary: string;
  greenFlag: string | null;
  redFlag: string | null;
}
export interface LessonFeedbackReport {
  session: LessonSession & { endedAt: string; durationMinutes: number };
  classroomName: string;
  studentCount: number;
  helperUsePercent: number;
  independentCount: number;
  followedPercent: number;
  averageFinishMinutes: number | null;
  averageQuizMinutes: number | null;
  completedCount: number;
  aiSummary: string;
  strengths: string[];
  attentionSuggestions: Array<{ studentId: string; studentName: string; reason: string }>;
  students: LessonFeedbackStudentSummary[];
}
export interface LessonFeedbackStudentDetail extends LessonFeedbackStudentSummary {
  aiLogs: Array<{
    askedAt: string;
    question: string;
    reply: string;
    safetyFlags: LessonFeedbackSafetyFlag[];
    flags: LessonFeedbackFlag[];
    misuse: string | null;
    reviewAvailable: boolean;
  }>;
  activityTimeline: Array<{ at: string; type: StudentActivityType; moduleTitle: string }>;
  aiSuggestion: string;
}
/**
 * GET /api/classrooms/:id/session (any member) — the live lesson, or null.
 * POST (teacher) `{ moduleId, phase? }` starts one (409 if already live; phase defaults to teach).
 * PATCH (teacher) `{ moduleId?, phase? }` moves the class to another lesson and/or phase (409 if not live).
 * DELETE (teacher) ends it. All return the resulting state, and every change is also pushed as `session_update`.
 */
export interface GetSessionResponse {
  session: LessonSession | null;
}
export interface StartSessionRequest {
  moduleId: string;
  phase?: LessonPhase;
}
export interface UpdateSessionRequest {
  moduleId?: string;
  phase?: LessonPhase;
}

/** A teacher's note to the class. */
export interface Announcement {
  id: string;
  classroomId: string;
  authorName: string;
  text: string;
  createdAt: string;
}
export interface CreateAnnouncementRequest {
  text: string;
}
export type ListAnnouncementsResponse = Announcement[];

/** One of the caller's classrooms, with their own progress through its lessons. */
export interface MyClassroom {
  id: string;
  name: string;
  teacherName: string | null;
  role: Role;
  lessonCount: number;
  completedCount: number;
  /** The classroom the app is currently showing (the most recently joined). */
  active: boolean;
  /** The lesson the teacher is running right now, or null when nothing is live. */
  liveSession: LessonSession | null;
}
/** GET /api/classrooms — every classroom the caller belongs to. */
export type ListMyClassroomsResponse = MyClassroom[];
/** POST /api/classrooms/:id/activate — makes one of the caller's classrooms the active one. */
export interface ActivateClassroomResponse {
  user: User;
}

export interface Module {
  id: string;
  classroomId: string;
  title: string;
  content: string;
  position: number;
  status: ModuleStatus;
  revision: number;
  /** Students can only open the lesson from this time (ISO), or any time before closesAt when null. */
  opensAt: string | null;
  /** Students can no longer open the lesson after this time (ISO), or never when null. */
  closesAt: string | null;
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
export interface CodeCheck {
  id: string;
  codeExerciseId: string;
  name: string;
  description: string;
  position: number;
}

/** A student's own run history for one code exercise. */
export interface ExerciseSummary {
  id: string;
  /** The question prompt. */
  title: string;
  runs: number;
  /** Outcome of the most recent run: it finished cleanly, or it ended in an error. null = never run. */
  lastRun: "ok" | "error" | null;
}
/** A lesson as one student sees it: the module plus their progress and what is in it. */
export interface LessonSummary extends Omit<Module, "status"> {
  status: ProgressStatus;
  /** Whether the student can open it right now: inside its time window, or the teacher is running it live. */
  available: boolean;
  sections: Array<{ id: string; title: string }>;
  exercises: ExerciseSummary[];
  /** All student-visible questions in this lesson, including non-code questions. */
  questionCount: number;
  /** Questions with saved work, an answer attempt, or a code submission from this student. */
  startedQuestionCount: number;
}
/** GET /api/classrooms/:id/lessons (student) — every lesson in order, with the caller's progress. */
export type ListLessonSummariesResponse = LessonSummary[];

/** Teacher aggregate. Includes answer keys and checks. */
export interface TeacherQuestion extends Question {
  answerKey: string | null;
  /** Teacher-only target values; student aggregates deliberately omit both fields. */
  mathExpectedResult: number | null;
  mathTolerance: number | null;
  codeExercise?: CodeExercise & {
    /** Appended by the server at run time; deliberately absent from student aggregates. */
    hiddenCode: string;
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
/** Student aggregate. Deliberately excludes answer keys and checks. */
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
/** One student's durable progress in the module currently being taught live. */
export interface LiveModuleProgress {
  studentId: string;
  status: ProgressStatus;
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
  /** Result of the most recent answer check; null when the answer has not been checked or cannot be graded. */
  isCorrect: boolean | null;
  /** Present only after the student has checked this answer. */
  checkedAt: string | null;
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
/** A persisted conversation attached directly to a lesson question, visible to that student and their teachers. */
export interface QuestionComment {
  id: string;
  questionId: string;
  /** The learner whose question conversation this belongs to. */
  studentId: string;
  authorId: string;
  text: string;
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

/** GET /api/auth/me (signed in) — `user` is null until they have created or been invited into a classroom. */
export interface MeResponse {
  user: User | null;
}

/**
 * POST /api/classrooms (signed in; no classroom needed) — a teacher creates a classroom and becomes its teacher.
 * There are no join codes: students only get in by accepting an invitation. Refused (403) for students.
 * The new classroom becomes the caller's active one.
 */
export interface CreateClassroomRequest {
  name: string;
}
export interface CreateClassroomResponse {
  classroom: Classroom;
  user: User;
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
          /** Deterministic server exercise id for an already saved code question. */
          codeExerciseId?: string;
          starterCode?: string;
          instructions?: string;
          /** Named function used by teacher-configured automated checks. */
          functionName?: string;
          /** Teacher-only test harness appended on the server when this exercise runs. */
          hiddenCode?: string;
          checks?: Array<{ id: string; name: string; description: string }>;
          tests?: Array<{
            id: string;
            name: string;
            args: unknown[];
            expected: unknown;
          }>;
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
  /** Present when the assistant could not produce a reviewable builder document. */
  warning?: string;
}
/** PUT /api/modules/:id/availability (teacher) — the time window students may open the lesson in; null = unbounded. */
export interface UpdateModuleAvailabilityRequest {
  opensAt: string | null;
  closesAt: string | null;
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
export interface CreateQuestionCommentRequest {
  text: string;
  /** Teachers select the learner; students are always forced to their own id server-side. */
  studentId?: string;
}

export type GetModuleResponse = StudentModule | TeacherModule;
export type ListModulesResponse = Module[];
export type GetClassroomResponse = Classroom;
export type GetClassroomStudentsResponse = User[];
/**
 * GET /api/classrooms/:id/session/progress (teacher only) — durable progress for every student in the active
 * classroom's current live module. Returns 409 when the classroom has no live lesson.
 */
export interface GetLiveModuleProgressResponse {
  sessionId: string;
  moduleId: string;
  progress: LiveModuleProgress[];
}
export type GetStudentProgressResponse = ModuleProgress[];
export type UpsertProgressRequest = UpsertModuleProgressRequest;
export type UpsertProgressResponse = ModuleProgress;
export type CreateCommentResponse = Comment;
export type ListQuestionCommentsResponse = QuestionComment[];
export type CreateQuestionCommentResponse = QuestionComment;
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
  checkedAt: string;
}
/** One turn of an AI conversation. The AI endpoints are stateless: the client re-sends the transcript each call. */
export interface AiChatMessage {
  role: "user" | "assistant";
  text: string;
}

/**
 * POST /api/ai/hint (student only) — "I'm stuck" tutor. Gives hints, never the solution, scoped to `moduleId`.
 * The server loads the module itself (student-safe view: no answer keys/checks).
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
  /** Teacher-editable label for this proposed case. */
  name: string;
  args: unknown[];
  expected: unknown;
}
export interface AiCodeTestCandidatesResponse {
  candidates: AiCodeTestCandidate[];
  /** Present when the model returned no safe, usable candidates. */
  warning?: string;
}
export interface ApiError {
  error: string;
}
