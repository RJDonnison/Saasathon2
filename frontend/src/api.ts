import type {
  ActivateClassroomResponse,
  GetSessionResponse,
  GetLiveModuleProgressResponse,
  LessonPhase,
  CreateAttemptRequest,
  CreateAttemptResponse,
  Announcement,
  CreateModuleRequest,
  UpdateModuleAvailabilityRequest,
  CreateSubmissionRequest,
  CodeSubmission,
  GetTeacherStudentAggregateResponse,
  ListAnnouncementsResponse,
  ListLessonSummariesResponse,
  ListMyClassroomsResponse,
  Module,
  AiDraftRequest,
  AiDraftResponse,
  AiHintRequest,
  AiHintResponse,
  AcceptInvitationResponse,
  AiCodeTestCandidatesRequest,
  AiCodeTestCandidatesResponse,
  AiModuleSuggestionsRequest,
  AiModuleSuggestionsResponse,
  ModuleBuilderDocument,
  SaveModuleBuilderResponse,
  ApiError,
  Comment,
  ClassroomInvitation,
  CreateClassroomResponse,
  CreateClassroomInvitationsRequest,
  CreateClassroomInvitationsResponse,
  CreateCommentRequest,
  GetClassroomResponse,
  GetClassroomStudentsResponse,
  GetModuleResponse,
  ListModulesResponse,
  ListMyInvitationsResponse,
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
  GetClassroomStudentActivityResponse,
  GetStudentWorkResponse,
  RecordStudentActivityRequest,
  SaveStudentWorkRequest,
  StudentActivity,
  CreateQuestionCommentRequest,
  CreateQuestionCommentResponse,
  ListQuestionCommentsResponse,
  LessonFeedbackReport,
  LessonFeedbackStudentDetail,
  AiLessonPlanRequest,
  AiLessonPlanResponse,
  SaveTeacherLessonPlanRequest,
  TeacherLessonPlan,
} from "../../shared/types";
import { supabase } from "./supabase.ts";
import { backendEndpoint } from "./endpoints.ts";

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
  if (backendEndpoint.error) throw new Error(backendEndpoint.error);

  const { json, ...requestInit } = init;
  const headers = new Headers(requestInit.headers);
  // The Supabase access token (auto-refreshed by supabase-js) authenticates every API call.
  if (!headers.has("Authorization")) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  if (json !== undefined) headers.set("Content-Type", "application/json");

  const res = await fetch(`${backendEndpoint.origin}${path}`, {
    ...requestInit,
    headers,
    body: json !== undefined ? JSON.stringify(json) : requestInit.body,
  });

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiClientError(res.status, err?.error ?? res.statusText);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

const post = <T>(path: string, json: unknown) =>
  request<T>(path, { method: "POST", json });

type GetOptions = Pick<RequestInit, "signal">;

export const api = {
  createClassroom: (name: string) =>
    post<CreateClassroomResponse>("/api/classrooms", { name }),
  me: (accessToken?: string) =>
    request<MeResponse>("/api/auth/me", {
      headers: accessToken
        ? { Authorization: `Bearer ${accessToken}` }
        : undefined,
    }),
  getModule: (id: string, options?: GetOptions) =>
    request<GetModuleResponse>(`/api/modules/${id}`, options),
  getClassroom: (id: string, options?: GetOptions) =>
    request<GetClassroomResponse>(`/api/classrooms/${id}`, options),
  listModules: (classroomId: string, options?: GetOptions) =>
    request<ListModulesResponse>(
      `/api/classrooms/${classroomId}/modules`,
      options,
    ),
  getStudents: (classroomId: string) =>
    request<GetClassroomStudentsResponse>(
      `/api/classrooms/${classroomId}/students`,
    ),
  getClassroomStudentActivity: (classroomId: string) =>
    request<GetClassroomStudentActivityResponse>(
      `/api/activity/classrooms/${classroomId}`,
    ),
  getTeacherStudentAggregate: (classroomId: string, studentId: string) =>
    request<GetTeacherStudentAggregateResponse>(
      `/api/classrooms/${classroomId}/students/${studentId}/aggregate`,
    ),
  getStudentWork: (moduleId: string, options?: GetOptions) =>
    request<GetStudentWorkResponse>(
      `/api/activity/work?moduleId=${encodeURIComponent(moduleId)}`,
      options,
    ),
  saveStudentWork: (body: SaveStudentWorkRequest) =>
    request(`/api/activity/work`, { method: "PUT", json: body }),
  recordStudentActivity: (body: RecordStudentActivityRequest) =>
    post<StudentActivity>("/api/activity", body),
  createComment: (body: CreateCommentRequest) =>
    post<Comment>("/api/comments", body),
  getQuestionComments: (
    questionId: string,
    studentId?: string,
    options?: GetOptions,
  ) =>
    request<ListQuestionCommentsResponse>(
      `/api/comments/questions/${questionId}/comments${studentId ? `?studentId=${encodeURIComponent(studentId)}` : ""}`,
      options,
    ),
  createQuestionComment: (
    questionId: string,
    body: CreateQuestionCommentRequest,
  ) =>
    post<CreateQuestionCommentResponse>(
      `/api/comments/questions/${questionId}/comments`,
      body,
    ),
  getInvitations: (classroomId: string) =>
    request<ClassroomInvitation[]>(
      `/api/classrooms/${classroomId}/invitations`,
    ),
  inviteStudents: (
    classroomId: string,
    body: CreateClassroomInvitationsRequest,
  ) =>
    post<CreateClassroomInvitationsResponse>(
      `/api/classrooms/${classroomId}/invitations`,
      body,
    ),
  removeInvitation: (classroomId: string, invitationId: string) =>
    request<void>(
      `/api/classrooms/${classroomId}/invitations/${invitationId}`,
      { method: "DELETE" },
    ),
  myInvitations: () => request<ListMyInvitationsResponse>("/api/invitations"),
  acceptInvitation: (id: string) =>
    post<AcceptInvitationResponse>(`/api/invitations/${id}/accept`, {}),
  declineInvitation: (id: string) =>
    post<void>(`/api/invitations/${id}/decline`, {}),
  myClassrooms: () => request<ListMyClassroomsResponse>("/api/classrooms"),
  activateClassroom: (id: string) =>
    post<ActivateClassroomResponse>(`/api/classrooms/${id}/activate`, {}),
  getLessons: (classroomId: string, options?: GetOptions) =>
    request<ListLessonSummariesResponse>(
      `/api/classrooms/${classroomId}/lessons`,
      options,
    ),
  getAnnouncements: (classroomId: string, options?: GetOptions) =>
    request<ListAnnouncementsResponse>(
      `/api/classrooms/${classroomId}/announcements`,
      options,
    ),
  postAnnouncement: (classroomId: string, text: string) =>
    post<Announcement>(`/api/classrooms/${classroomId}/announcements`, {
      text,
    }),
  deleteAnnouncement: (classroomId: string, id: string) =>
    request<void>(`/api/classrooms/${classroomId}/announcements/${id}`, {
      method: "DELETE",
    }),
  createModule: (body: CreateModuleRequest) =>
    post<Module>("/api/modules", body),
  getSession: (classroomId: string) =>
    request<GetSessionResponse>(`/api/classrooms/${classroomId}/session`),
  getLiveModuleProgress: (classroomId: string) =>
    request<GetLiveModuleProgressResponse>(
      `/api/classrooms/${classroomId}/session/progress`,
    ),
  startSession: (
    classroomId: string,
    moduleId: string,
    phase: LessonPhase = "teach",
  ) =>
    post<GetSessionResponse>(`/api/classrooms/${classroomId}/session`, {
      moduleId,
      phase,
    }),
  updateSession: (
    classroomId: string,
    body: { moduleId?: string; phase?: LessonPhase },
  ) =>
    request<GetSessionResponse>(`/api/classrooms/${classroomId}/session`, {
      method: "PATCH",
      json: body,
    }),
  endSession: (classroomId: string) =>
    request<GetSessionResponse>(`/api/classrooms/${classroomId}/session`, {
      method: "DELETE",
    }),
  recordLessonFollow: (sessionId: string, following: boolean) =>
    post<void>("/api/feedback/follow", { sessionId, following }),
  getLessonFeedback: (sessionId: string) =>
    request<LessonFeedbackReport>(
      `/api/feedback/sessions/${encodeURIComponent(sessionId)}`,
    ),
  getLessonStudentFeedback: (sessionId: string, studentId: string) =>
    request<LessonFeedbackStudentDetail>(
      `/api/feedback/sessions/${encodeURIComponent(sessionId)}/students/${encodeURIComponent(studentId)}`,
    ),
  createAttempt: (body: CreateAttemptRequest) =>
    post<CreateAttemptResponse>("/api/comments/attempts", body),
  createSubmission: (body: CreateSubmissionRequest) =>
    post<CodeSubmission>("/api/comments/submissions", body),
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
  updateModuleAvailability: (
    id: string,
    body: UpdateModuleAvailabilityRequest,
  ) =>
    request<Module>(`/api/modules/${id}/availability`, {
      method: "PUT",
      json: body,
    }),
  deleteModule: (id: string) =>
    request<void>(`/api/modules/${id}`, { method: "DELETE" }),
  validateMath: (body: ValidateMathRequest) =>
    post<ValidateMathResponse>("/api/math/validate", body),
  aiHint: (body: AiHintRequest) => post<AiHintResponse>("/api/ai/hint", body),
  /** Teacher-only drafting/planning assistant (for the teacher dashboard to call). */
  aiDraft: (body: AiDraftRequest) =>
    post<AiDraftResponse>("/api/ai/draft", body),
  aiLessonPlan: (body: AiLessonPlanRequest) =>
    post<AiLessonPlanResponse>("/api/ai/lesson-plan", body),
  listTeacherLessonPlans: () =>
    request<TeacherLessonPlan[]>("/api/lesson-plans"),
  createTeacherLessonPlan: (body: SaveTeacherLessonPlanRequest) =>
    post<TeacherLessonPlan>("/api/lesson-plans", body),
  updateTeacherLessonPlan: (id: string, body: SaveTeacherLessonPlanRequest) =>
    request<TeacherLessonPlan>(`/api/lesson-plans/${encodeURIComponent(id)}`, {
      method: "PUT",
      json: body,
    }),
  linkTeacherLessonPlanModule: (id: string, moduleId: string) =>
    post<{ moduleId: string }>(
      `/api/lesson-plans/${encodeURIComponent(id)}/module`,
      { moduleId },
    ),
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
