import type {
  AiHintRequest,
  AiHintResponse,
  ApiError,
  CreateModuleRequest,
  CreateSectionRequest,
  CreateQuestionRequest,
  CreateBlockRequest,
  CreateCommentRequest,
  CreateCommentResponse,
  GetClassroomStudentsResponse,
  GetTeacherModuleResponse,
  GetTeacherStudentAggregateResponse,
  JoinRequest,
  JoinResponse,
  ListModulesResponse,
  Module,
  Section,
  SectionBlock,
  TeacherQuestion,
  UpdateModuleRequest,
  MeResponse,
  RunCodeRequest,
  RunCodeResponse,
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
  getTeacherModule: (id: string) =>
    request<GetTeacherModuleResponse>(`/api/modules/${id}`),
  listModules: (classroomId: string) =>
    request<ListModulesResponse>(`/api/classrooms/${classroomId}/modules`),
  getStudents: (classroomId: string) =>
    request<GetClassroomStudentsResponse>(
      `/api/classrooms/${classroomId}/students`,
    ),
  createComment: (body: CreateCommentRequest) =>
    post<CreateCommentResponse>("/api/comments", body),
  getStudentAggregate: (classroomId: string, studentId: string) =>
    request<GetTeacherStudentAggregateResponse>(
      `/api/classrooms/${classroomId}/students/${studentId}/aggregate`,
    ),
  createModule: (body: CreateModuleRequest) =>
    post<Module>("/api/modules", body),
  updateModule: (id: string, body: UpdateModuleRequest) =>
    request<Module>(`/api/modules/${id}`, { method: "PATCH", json: body }),
  updateSection: (id: string, body: { position: number }) =>
    request<Section>(`/api/modules/sections/${id}`, {
      method: "PATCH",
      json: body,
    }),
  deleteModule: (id: string) =>
    request<void>(`/api/modules/${id}`, { method: "DELETE" }),
  createSection: (moduleId: string, body: CreateSectionRequest) =>
    post<Section>(`/api/modules/${moduleId}/sections`, body),
  createBlock: (sectionId: string, body: CreateBlockRequest) =>
    post<SectionBlock>(`/api/modules/sections/${sectionId}/blocks`, body),
  updateBlock: (id: string, body: { position: number }) =>
    request<SectionBlock>(`/api/modules/blocks/${id}`, {
      method: "PATCH",
      json: body,
    }),
  createQuestion: (sectionId: string, body: CreateQuestionRequest) =>
    post<TeacherQuestion>(`/api/modules/sections/${sectionId}/questions`, body),
  updateQuestion: (id: string, body: { position: number }) =>
    request<TeacherQuestion>(`/api/modules/questions/${id}`, {
      method: "PATCH",
      json: body,
    }),
  updateOption: (id: string, body: { position: number }) =>
    request(`/api/modules/options/${id}`, { method: "PATCH", json: body }),
  updateReference: (id: string, body: { position: number }) =>
    request(`/api/modules/references/${id}`, { method: "PATCH", json: body }),
  updateCheck: (id: string, body: { position: number }) =>
    request(`/api/modules/checks/${id}`, { method: "PATCH", json: body }),
  upsertProgress: (body: UpsertProgressRequest) =>
    request<UpsertProgressResponse>("/api/progress", {
      method: "PUT",
      json: body,
    }),
  runCode: (body: RunCodeRequest) =>
    post<RunCodeResponse>("/api/code/run", body),
  aiHint: (body: AiHintRequest) => post<AiHintResponse>("/api/ai/hint", body),
};
