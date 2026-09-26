import { io, type Socket } from "socket.io-client";
import type {
  ClientToServerEvents,
  PresenceUpdatePayload,
  RaisedHandsUpdatePayload,
  ServerToClientEvents,
  SessionUpdatePayload,
  StudentStatusUpdatePayload,
  StudentActivityUpdatePayload,
  ModuleChangedPayload,
  QuestionCommentCreatedPayload,
  ModuleDeletedPayload,
} from "../../shared/events";
import { supabase } from "./supabase.ts";

type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

// One long-lived socket that does NOT connect on its own (autoConnect: false).
// Listeners can be attached at any time (even before login); the connection itself is opened
// by connectSocket() only once the user is signed in and in a classroom. Same origin — Vite proxies
// /socket.io. `auth` is a function so every (re)connect sends the current, auto-refreshed Supabase token.
const socket: AppSocket = io({
  autoConnect: false,
  auth: (cb) => {
    void supabase.auth
      .getSession()
      .then(({ data }) => cb({ token: data.session?.access_token ?? "" }));
  },
});
socket.on("connect_error", (err) =>
  console.warn("[socket] connect_error:", err.message),
);

// Cache the most recent snapshot. Socket setup happens above page components, so this avoids
// losing the initial snapshot when a route mounts just after the connection succeeds.
let currentRaisedHands: RaisedHandsUpdatePayload | null = null;
let currentPresence: PresenceUpdatePayload | null = null;
const raisedHandsListeners = new Set<(p: RaisedHandsUpdatePayload) => void>();
socket.on("raised_hands_update", (payload) => {
  currentRaisedHands = payload;
  for (const listener of raisedHandsListeners) listener(payload);
});
socket.on("presence_update", (payload) => {
  currentPresence = payload;
});

/** Open the connection. Call only once signed in and in a classroom — the server rejects the handshake otherwise. */
export function connectSocket() {
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  socket.disconnect();
  currentRaisedHands = null;
  currentPresence = null;
}

// ---- emit helpers (dropped when not connected, rather than buffered) ----

export function emitRaiseHand(studentId: string, classroomId: string): boolean {
  if (!socket.connected) return false;
  socket.emit("raise_hand", { type: "raise_hand", studentId, classroomId });
  return true;
}

export function emitAcknowledgeHand(studentId: string, classroomId: string) {
  if (!socket.connected) return;
  socket.emit("acknowledge_hand", {
    type: "acknowledge_hand",
    studentId,
    classroomId,
  });
}

export function emitStudentStatusUpdate(
  p: Omit<StudentStatusUpdatePayload, "type">,
) {
  if (!socket.connected) return;
  socket.emit("student_status_update", { type: "student_status_update", ...p });
}

// ---- listeners; each returns an unsubscribe function ----

export function onRaisedHandsUpdate(
  cb: (p: RaisedHandsUpdatePayload) => void,
): () => void {
  raisedHandsListeners.add(cb);
  if (currentRaisedHands) cb(currentRaisedHands);
  return () => void raisedHandsListeners.delete(cb);
}

export function onStudentStatusUpdate(
  cb: (p: StudentStatusUpdatePayload) => void,
): () => void {
  socket.on("student_status_update", cb);
  return () => void socket.off("student_status_update", cb);
}
export function onStudentActivityUpdate(
  cb: (p: StudentActivityUpdatePayload) => void,
): () => void {
  socket.on("student_activity_update", cb);
  return () => void socket.off("student_activity_update", cb);
}

export function onSessionUpdate(cb: (p: SessionUpdatePayload) => void): () => void {
  socket.on("session_update", cb);
  return () => void socket.off("session_update", cb);
}

export function onPresenceUpdate(
  cb: (p: PresenceUpdatePayload) => void,
): () => void {
  socket.on("presence_update", cb);
  if (currentPresence) cb(currentPresence);
  return () => void socket.off("presence_update", cb);
}

export function onModuleChanged(
  cb: (p: ModuleChangedPayload) => void,
): () => void {
  socket.on("module_changed", cb);
  return () => void socket.off("module_changed", cb);
}
export function onQuestionCommentCreated(
  cb: (p: QuestionCommentCreatedPayload) => void,
): () => void {
  socket.on("question_comment_created", cb);
  return () => void socket.off("question_comment_created", cb);
}

export function onModuleDeleted(
  cb: (p: ModuleDeletedPayload) => void,
): () => void {
  socket.on("module_deleted", cb);
  return () => void socket.off("module_deleted", cb);
}
