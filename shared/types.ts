// Single source of truth for entities and REST contracts.
// Plain file (not an npm package) — imported by relative path from backend and frontend.

export type Role = 'student' | 'teacher';
export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

// ---------- Entities ----------

export interface Classroom {
  id: string;
  name: string;
  roomCode: string;
}

export interface User {
  id: string;
  name: string;
  role: Role;
  classroomId: string;
}

export interface Module {
  id: string;
  classroomId: string;
  title: string;
  content: string;
}

export interface ProgressRecord {
  id: string;
  studentId: string;
  moduleId: string;
  status: ProgressStatus;
}

export interface Comment {
  id: string;
  studentId: string;
  moduleId: string;
  text: string;
  createdAt: string; // ISO 8601
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

/** GET /api/modules/:id -> Module */
export type GetModuleResponse = Module;

/** GET /api/classrooms/:id/students -> User[] */
export type GetClassroomStudentsResponse = User[];

/** GET /api/classrooms/:id -> Classroom */
export type GetClassroomResponse = Classroom;

/** GET /api/classrooms/:id/modules -> Module[] */
export type ListModulesResponse = Module[];

/** POST /api/modules (teacher only; classroom taken from the auth token) */
export interface CreateModuleRequest {
  title: string;
  content: string;
}
export type CreateModuleResponse = Module;

/** PATCH /api/modules/:id (teacher only) */
export interface UpdateModuleRequest {
  title?: string;
  content?: string;
}
export type UpdateModuleResponse = Module;

/** DELETE /api/modules/:id (teacher only) -> 204 No Content */

/** GET /api/modules/:id/comments -> Comment[] (teachers see all, students see their own) */
export type ListCommentsResponse = Comment[];

/** GET /api/students/:id/progress -> ProgressRecord[] (the student themself, or a teacher) */
export type GetStudentProgressResponse = ProgressRecord[];

/** PUT /api/progress (the student themself, or a teacher) — upserts one record */
export interface UpsertProgressRequest {
  studentId: string;
  moduleId: string;
  status: ProgressStatus;
}
export type UpsertProgressResponse = ProgressRecord;

/** POST /api/comments */
export interface CreateCommentRequest {
  studentId: string;
  moduleId: string;
  text: string;
}
export type CreateCommentResponse = Comment;

/** POST /api/code/run (MOCKED on the backend) */
export interface RunCodeRequest {
  code: string;
  language: string;
}
export interface RunCodeResponse {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** POST /api/ai/hint (MOCKED on the backend) */
export interface AiHintRequest {
  moduleId: string;
  studentId: string;
  question: string;
}
export interface AiHintResponse {
  reply: string;
}

/** Error body returned by the backend for any non-2xx response. */
export interface ApiError {
  error: string;
}
