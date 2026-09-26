import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { findProfile, verifyToken, type AuthUser } from "./auth.js";
import { CLIENT_ORIGIN } from "./config.js";
import type {
  ClientToServerEvents,
  ModuleChangedPayload,
  QuestionCommentCreatedPayload,
  PresenceUpdatePayload,
  RaisedHandsUpdatePayload,
  StudentActivityUpdatePayload,
  ServerToClientEvents,
} from "../../shared/events.js";

type SocketData = { user: AuthUser };
type AppServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type AppSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

// In-memory presence: classroomId -> studentId -> number of open sockets (handles multiple tabs).
const online = new Map<string, Map<string, number>>();
// Unacknowledged hands survive page navigation and reconnects while this server is running.
const raisedHands = new Map<string, Map<string, number>>();
let appIo: AppServer | null = null;
export function emitModuleChanged(payload: ModuleChangedPayload) {
  appIo?.to(payload.classroomId).emit("module_changed", payload);
}
export function emitStudentActivityUpdate(payload: StudentActivityUpdatePayload) {
  appIo?.to(payload.classroomId).emit("student_activity_update", payload);
}
export function emitQuestionCommentCreated(payload: QuestionCommentCreatedPayload) {
  appIo?.to(payload.classroomId).emit("question_comment_created", payload);
}

function onlineStudentIds(classroomId: string): string[] {
  return [...(online.get(classroomId)?.keys() ?? [])];
}

function presencePayload(classroomId: string): PresenceUpdatePayload {
  return {
    type: "presence_update",
    classroomId,
    onlineStudentIds: onlineStudentIds(classroomId),
  };
}

function raisedHandsPayload(classroomId: string): RaisedHandsUpdatePayload {
  const hands = [...(raisedHands.get(classroomId)?.entries() ?? [])]
    .map(([studentId, raisedAt]) => ({ studentId, raisedAt }))
    .sort((a, b) => b.raisedAt - a.raisedAt);
  return { type: "raised_hands_update", classroomId, hands };
}

function emitRaisedHands(classroomId: string) {
  appIo?.to(classroomId).emit("raised_hands_update", raisedHandsPayload(classroomId));
}

export function attachSockets(httpServer: HttpServer): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: CLIENT_ORIGIN },
  });
  appIo = io;

  // Authenticate the handshake with the same Supabase access token used for REST:
  // io(url, { auth: { token } }). The user must also have joined a classroom.
  io.use(async (socket, next) => {
    try {
      const token = (socket.handshake.auth as { token?: unknown }).token;
      const identity =
        typeof token === "string" ? await verifyToken(token) : null;
      const profile = identity ? await findProfile(identity.authId) : null;
      if (!profile) return next(new Error("unauthorized"));
      socket.data.user = {
        userId: profile.id,
        membershipId: profile.membershipId,
        role: profile.role,
        classroomId: profile.classroomId,
      };
      next();
    } catch {
      next(new Error("unauthorized"));
    }
  });

  io.on("connection", (socket: AppSocket) => {
    const { userId, role, classroomId } = socket.data.user;
    void socket.join(classroomId);

    if (role === "student") {
      const students = online.get(classroomId) ?? new Map<string, number>();
      students.set(userId, (students.get(userId) ?? 0) + 1);
      online.set(classroomId, students);
    }
    // Everyone (including the joining socket) gets the current presence list.
    io.to(classroomId).emit("presence_update", presencePayload(classroomId));
    // Send a snapshot directly so a page that mounts after the socket connects still learns
    // about hands that have not yet been acknowledged.
    socket.emit("raised_hands_update", raisedHandsPayload(classroomId));

    // The server trusts the token, not the payload: students can only speak as themselves,
    // in their own classroom.
    const isValidSender = (studentId: string, payloadClassroomId: string) =>
      role === "student" &&
      studentId === userId &&
      payloadClassroomId === classroomId;

    socket.on("raise_hand", (payload) => {
      if (!isValidSender(payload?.studentId, payload?.classroomId)) return;
      const hands = raisedHands.get(classroomId) ?? new Map<string, number>();
      // Re-raising is idempotent: it keeps the original request time until a teacher helps.
      if (!hands.has(userId)) hands.set(userId, Date.now());
      raisedHands.set(classroomId, hands);
      emitRaisedHands(classroomId);
    });

    socket.on("acknowledge_hand", (payload) => {
      if (
        role !== "teacher" ||
        payload?.classroomId !== classroomId ||
        typeof payload?.studentId !== "string"
      )
        return;
      const hands = raisedHands.get(classroomId);
      if (!hands?.delete(payload.studentId)) return;
      if (hands.size === 0) raisedHands.delete(classroomId);
      emitRaisedHands(classroomId);
    });

    socket.on("student_status_update", (payload) => {
      if (!isValidSender(payload?.studentId, payload?.classroomId)) return;
      io.to(classroomId).emit("student_status_update", {
        type: "student_status_update",
        studentId: userId,
        classroomId,
        status: payload.status,
        moduleId: payload.moduleId,
      });
    });

    socket.on("disconnect", () => {
      if (role === "student") {
        const students = online.get(classroomId);
        const remaining = (students?.get(userId) ?? 1) - 1;
        if (remaining <= 0) students?.delete(userId);
        else students?.set(userId, remaining);
        if (students && students.size === 0) online.delete(classroomId);
      }
      io.to(classroomId).emit("presence_update", presencePayload(classroomId));
    });
  });

  return io;
}
