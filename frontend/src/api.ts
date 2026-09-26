import type {
  AiHintRequest,
  AiHintResponse,
  ApiError,
  CodeExercise,
  Comment,
  CreateCodeCheckRequest,
  CreateCommentRequest,
  CreateModuleRequest,
  CreateQuestionRequest,
  CreateSectionRequest,
  GetClassroomStudentsResponse,
  GetModuleResponse,
  JoinRequest,
  JoinResponse,
  ListModulesResponse,
  MeResponse,
  Module,
  Question,
  RunChecksResponse,
  Section,
  SubmitChecksRequest,
  UpdateCodeCheckRequest,
  UpsertCodeExerciseRequest,
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
  me: () => request<MeResponse>("/api/auth/me"),
  getModule: (id: string) => request<GetModuleResponse>(`/api/modules/${id}`),
  listModules: (classroomId: string) =>
    request<ListModulesResponse>(`/api/classrooms/${classroomId}/modules`),
  getStudents: (classroomId: string) =>
    request<GetClassroomStudentsResponse>(
      `/api/classrooms/${classroomId}/students`,
    ),
  createComment: (body: CreateCommentRequest) =>
    post<Comment>("/api/comments", body),
  upsertProgress: (body: UpsertProgressRequest) =>
    request<UpsertProgressResponse>("/api/progress", {
      method: "PUT",
      json: body,
    }),
  checkCode: (body: SubmitChecksRequest) =>
    post<RunChecksResponse>("/api/code/check", body),
  createModule: (body: CreateModuleRequest) =>
    post<Module>("/api/modules", body),
  createSection: (moduleId: string, body: CreateSectionRequest) =>
    post<Section>(`/api/modules/${moduleId}/sections`, body),
  createQuestion: (sectionId: string, body: CreateQuestionRequest) =>
    post<Question & { answerKey: string | null }>(
      `/api/modules/sections/${sectionId}/questions`,
      body,
    ),
  upsertExercise: (questionId: string, body: UpsertCodeExerciseRequest) =>
    request<CodeExercise>(`/api/modules/questions/${questionId}/exercise`, {
      method: "PUT",
      json: body,
    }),
  createCheck: (exerciseId: string, body: CreateCodeCheckRequest) =>
    post<unknown>(`/api/modules/exercises/${exerciseId}/checks`, body),
  updateCheck: (id: string, body: UpdateCodeCheckRequest) =>
    request<unknown>(`/api/modules/checks/${id}`, {
      method: "PATCH",
      json: body,
    }),
  deleteCheck: (id: string) =>
    request<unknown>(`/api/modules/checks/${id}`, { method: "DELETE" }),
  aiHint: (body: AiHintRequest) => post<AiHintResponse>("/api/ai/hint", body),
};
