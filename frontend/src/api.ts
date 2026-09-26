import type {
  ActivateClassroomResponse,
  GetSessionResponse,
  LessonPhase,
  CreateAttemptRequest,
  CreateAttemptResponse,
  Announcement,
  CreateModuleRequest,
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
  UpsertProgressRequest,
  UpsertProgressResponse,
} from '../../shared/types'
import { supabase } from './supabase.ts'

export class ApiClientError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers)
  // The Supabase access token (auto-refreshed by supabase-js) authenticates every API call.
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init.json !== undefined) headers.set('Content-Type', 'application/json')

  const res = await fetch(path, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  })

  if (!res.ok) {
    const err = (await res.json().catch(() => null)) as ApiError | null
    throw new ApiClientError(res.status, err?.error ?? res.statusText)
  }
  return (res.status === 204 ? undefined : await res.json()) as T
}

const post = <T>(path: string, json: unknown) => request<T>(path, { method: 'POST', json })

export const api = {
  createClassroom: (name: string) => post<CreateClassroomResponse>('/api/classrooms', { name }),
  me: () => request<MeResponse>('/api/auth/me'),
  getModule: (id: string) => request<GetModuleResponse>(`/api/modules/${id}`),
  getClassroom: (id: string) => request<GetClassroomResponse>(`/api/classrooms/${id}`),
  listModules: (classroomId: string) => request<ListModulesResponse>(`/api/classrooms/${classroomId}/modules`),
  getStudents: (classroomId: string) =>
    request<GetClassroomStudentsResponse>(`/api/classrooms/${classroomId}/students`),
  getInvitations: (classroomId: string) =>
    request<ClassroomInvitation[]>(`/api/classrooms/${classroomId}/invitations`),
  inviteStudents: (classroomId: string, body: CreateClassroomInvitationsRequest) =>
    post<CreateClassroomInvitationsResponse>(`/api/classrooms/${classroomId}/invitations`, body),
  removeInvitation: (classroomId: string, invitationId: string) =>
    request<void>(`/api/classrooms/${classroomId}/invitations/${invitationId}`, { method: 'DELETE' }),
  myInvitations: () => request<ListMyInvitationsResponse>('/api/invitations'),
  acceptInvitation: (id: string) => post<AcceptInvitationResponse>(`/api/invitations/${id}/accept`, {}),
  declineInvitation: (id: string) => post<void>(`/api/invitations/${id}/decline`, {}),
  myClassrooms: () => request<ListMyClassroomsResponse>('/api/classrooms'),
  activateClassroom: (id: string) => post<ActivateClassroomResponse>(`/api/classrooms/${id}/activate`, {}),
  getLessons: (classroomId: string) => request<ListLessonSummariesResponse>(`/api/classrooms/${classroomId}/lessons`),
  getAnnouncements: (classroomId: string) => request<ListAnnouncementsResponse>(`/api/classrooms/${classroomId}/announcements`),
  postAnnouncement: (classroomId: string, text: string) => post<Announcement>(`/api/classrooms/${classroomId}/announcements`, { text }),
  deleteAnnouncement: (classroomId: string, id: string) =>
    request<void>(`/api/classrooms/${classroomId}/announcements/${id}`, { method: 'DELETE' }),
  getStudentAggregate: (classroomId: string, studentId: string) =>
    request<GetTeacherStudentAggregateResponse>(`/api/classrooms/${classroomId}/students/${studentId}/aggregate`),
  createModule: (body: CreateModuleRequest) => post<Module>('/api/modules', body),
  getSession: (classroomId: string) => request<GetSessionResponse>(`/api/classrooms/${classroomId}/session`),
  startSession: (classroomId: string, moduleId: string, phase: LessonPhase = 'teach') =>
    post<GetSessionResponse>(`/api/classrooms/${classroomId}/session`, { moduleId, phase }),
  updateSession: (classroomId: string, body: { moduleId?: string; phase?: LessonPhase }) =>
    request<GetSessionResponse>(`/api/classrooms/${classroomId}/session`, { method: 'PATCH', json: body }),
  endSession: (classroomId: string) =>
    request<GetSessionResponse>(`/api/classrooms/${classroomId}/session`, { method: 'DELETE' }),
  createAttempt: (body: CreateAttemptRequest) => post<CreateAttemptResponse>('/api/comments/attempts', body),
  createSubmission: (body: CreateSubmissionRequest) => post<CodeSubmission>('/api/comments/submissions', body),
  createComment: (body: CreateCommentRequest) => post<Comment>('/api/comments', body),
  upsertProgress: (body: UpsertProgressRequest) =>
    request<UpsertProgressResponse>('/api/progress', { method: 'PUT', json: body }),
  runCode: (body: RunCodeRequest) => post<RunCodeResponse>('/api/code/run', body),
  aiHint: (body: AiHintRequest) => post<AiHintResponse>('/api/ai/hint', body),
  /** Teacher-only drafting/planning assistant (for the teacher dashboard to call). */
  aiDraft: (body: AiDraftRequest) => post<AiDraftResponse>('/api/ai/draft', body),
}
