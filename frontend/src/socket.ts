import { io, type Socket } from 'socket.io-client'
import type {
  ClientToServerEvents,
  PresenceUpdatePayload,
  RaiseHandPayload,
  ServerToClientEvents,
  StudentStatusUpdatePayload,
} from '../../shared/events'

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

// One long-lived socket that does NOT connect on its own (autoConnect: false).
// Listeners can be attached at any time (even before login); the connection itself is opened
// by connectSocket() only once the user is authenticated. Same origin — Vite proxies /socket.io.
const socket: AppSocket = io({ autoConnect: false })
socket.on('connect_error', (err) => console.warn('[socket] connect_error:', err.message))

/** Open the connection. Call only once authenticated — the server rejects handshakes without a valid JWT. */
export function connectSocket(token: string) {
  socket.auth = { token }
  if (!socket.connected) socket.connect()
}

export function disconnectSocket() {
  socket.disconnect()
}

// ---- emit helpers (dropped when not connected, rather than buffered) ----

export function emitRaiseHand(studentId: string, classroomId: string) {
  if (!socket.connected) return
  socket.emit('raise_hand', { type: 'raise_hand', studentId, classroomId })
}

export function emitStudentStatusUpdate(p: Omit<StudentStatusUpdatePayload, 'type'>) {
  if (!socket.connected) return
  socket.emit('student_status_update', { type: 'student_status_update', ...p })
}

// ---- listeners; each returns an unsubscribe function ----

export function onRaiseHand(cb: (p: RaiseHandPayload) => void): () => void {
  socket.on('raise_hand', cb)
  return () => void socket.off('raise_hand', cb)
}

export function onStudentStatusUpdate(cb: (p: StudentStatusUpdatePayload) => void): () => void {
  socket.on('student_status_update', cb)
  return () => void socket.off('student_status_update', cb)
}

export function onPresenceUpdate(cb: (p: PresenceUpdatePayload) => void): () => void {
  socket.on('presence_update', cb)
  return () => void socket.off('presence_update', cb)
}
