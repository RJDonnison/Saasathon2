import type {
  AiHintRequest,
  AiHintResponse,
  ApiError,
  Comment,
  CreateCommentRequest,
  GetClassroomStudentsResponse,
  GetModuleResponse,
  JoinRequest,
  JoinResponse,
  ListModulesResponse,
  MeResponse,
  RunCodeRequest,
  RunCodeResponse,
  UpsertProgressRequest,
  UpsertProgressResponse,
} from '../../shared/types'

const TOKEN_KEY = 'auth_token'

export const tokenStore = {
  get: (): string | null => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
}

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
  const token = tokenStore.get()
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
  join: (body: JoinRequest) => post<JoinResponse>('/api/auth/join', body),
  me: () => request<MeResponse>('/api/auth/me'),
  getModule: (id: string) => request<GetModuleResponse>(`/api/modules/${id}`),
  listModules: (classroomId: string) => request<ListModulesResponse>(`/api/classrooms/${classroomId}/modules`),
  getStudents: (classroomId: string) =>
    request<GetClassroomStudentsResponse>(`/api/classrooms/${classroomId}/students`),
  createComment: (body: CreateCommentRequest) => post<Comment>('/api/comments', body),
  upsertProgress: (body: UpsertProgressRequest) =>
    request<UpsertProgressResponse>('/api/progress', { method: 'PUT', json: body }),
  runCode: (body: RunCodeRequest) => post<RunCodeResponse>('/api/code/run', body),
  aiHint: (body: AiHintRequest) => post<AiHintResponse>('/api/ai/hint', body),
}
