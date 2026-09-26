import type {
  AiDraftRequest,
  AiDraftResponse,
  AiHintRequest,
  AiHintResponse,
  AiCodeTestCandidatesRequest,
  AiCodeTestCandidatesResponse,
  AiModuleSuggestionsRequest,
  AiModuleSuggestionsResponse,
  ModuleBuilderDocument,
  SaveModuleBuilderResponse,
  ApiError,
  Comment,
  Attempt,
  CreateCommentRequest,
  CreateAttemptRequest,
  GetClassroomResponse,
  GetClassroomStudentsResponse,
  GetModuleResponse,
  JoinRequest,
  JoinResponse,
  ListModulesResponse,
  MeResponse,
  RunCodeRequest,
  RunCodeResponse,
  GradeCodeExerciseRequest,
  GradeCodeExerciseResponse,
  CodeExercise,
  CodeTest,
  CreateCodeTestRequest,
  UpdateCodeTestRequest,
  UpdateCodeExerciseRequest,
  UpdateQuestionRequest,
  ValidateMathRequest,
  ValidateMathResponse,
  UpsertProgressRequest,
  UpsertProgressResponse,
} from "../../shared/types";
import { supabase } from "./supabase.ts";

export class ApiClientError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  // The Supabase access token (auto-refreshed by supabase-js) authenticates every API call.
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.json !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiClientError(res.status, err?.error ?? res.statusText);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const post = <T>(path: string, json: unknown) =>
  request<T>(path, { method: "POST", json });

export const api = {
  join: (body: JoinRequest) => post<JoinResponse>("/api/auth/join", body),
  createClassroom: (name: string, roomCode: string) =>
    post<{ id: string; name: string; roomCode: string }>("/api/classrooms", {
      name,
      roomCode,
    }),
  me: () => request<MeResponse>("/api/auth/me"),
  getModule: (id: string) => request<GetModuleResponse>(`/api/modules/${id}`),
  getClassroom: (id: string) =>
    request<GetClassroomResponse>(`/api/classrooms/${id}`),
  listModules: (classroomId: string) =>
    request<ListModulesResponse>(`/api/classrooms/${classroomId}/modules`),
  getStudents: (classroomId: string) =>
    request<GetClassroomStudentsResponse>(
      `/api/classrooms/${classroomId}/students`,
    ),
  createComment: (body: CreateCommentRequest) =>
    post<Comment>("/api/comments", body),
  createAttempt: (body: CreateAttemptRequest) =>
    post<Attempt>("/api/comments/attempts", body),
  upsertProgress: (body: UpsertProgressRequest) =>
    request<UpsertProgressResponse>("/api/progress", {
      method: "PUT",
      json: body,
    }),
  runCode: (body: RunCodeRequest) =>
    post<RunCodeResponse>("/api/code/run", body),
  gradeCode: (body: GradeCodeExerciseRequest) =>
    post<GradeCodeExerciseResponse>("/api/code/grade", body),
  updateExercise: (id: string, body: UpdateCodeExerciseRequest) =>
    request<CodeExercise>(`/api/modules/exercises/${id}`, {
      method: "PATCH",
      json: body,
    }),
  updateQuestion: (id: string, body: UpdateQuestionRequest) =>
    request(`/api/modules/questions/${id}`, { method: "PATCH", json: body }),
  createCodeTest: (exerciseId: string, body: CreateCodeTestRequest) =>
    post<CodeTest>(`/api/modules/exercises/${exerciseId}/tests`, body),
  updateCodeTest: (id: string, body: UpdateCodeTestRequest) =>
    request<CodeTest>(`/api/modules/tests/${id}`, {
      method: "PATCH",
      json: body,
    }),
  deleteCodeTest: (id: string) =>
    request<void>(`/api/modules/tests/${id}`, { method: "DELETE" }),
  validateMath: (body: ValidateMathRequest) =>
    post<ValidateMathResponse>("/api/math/validate", body),
  aiHint: (body: AiHintRequest) => post<AiHintResponse>("/api/ai/hint", body),
  /** Teacher-only drafting/planning assistant (for the teacher dashboard to call). */
  aiDraft: (body: AiDraftRequest) =>
    post<AiDraftResponse>("/api/ai/draft", body),
  aiCodeTestCandidates: (body: AiCodeTestCandidatesRequest) =>
    post<AiCodeTestCandidatesResponse>("/api/ai/code-test-candidates", body),
  createBuilderModule: (document: ModuleBuilderDocument) =>
    post<SaveModuleBuilderResponse>("/api/modules/builder", { document }),
  saveBuilderModule: (
    id: string,
    revision: number,
    document: ModuleBuilderDocument,
  ) =>
    request<SaveModuleBuilderResponse>(`/api/modules/${id}/builder`, {
      method: "PUT",
      json: { revision, document },
    }),
  aiModuleSuggestions: (body: AiModuleSuggestionsRequest) =>
    post<AiModuleSuggestionsResponse>("/api/ai/module-suggestions", body),
};
