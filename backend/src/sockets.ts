import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { findProfile, verifyToken, type AuthUser } from "./auth.js";
import { CLIENT_ORIGIN } from "./config.js";
import { publishedModuleInClassroom } from "./access.js";
import type {
  ClientToServerEvents,
  PresenceUpdatePayload,
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
const statuses = new Set(["idle", "working", "stuck"]);

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

export function attachSockets(httpServer: HttpServer): AppServer {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: CLIENT_ORIGIN },
  });

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

    // The server trusts the token, not the payload: students can only speak as themselves,
    // in their own classroom.
    const isValidSender = (studentId: string, payloadClassroomId: string) =>
      role === "student" &&
      studentId === userId &&
      payloadClassroomId === classroomId;
    let lastRaise = 0;
    let lastStatus = 0;

    socket.on("raise_hand", (payload) => {
      if (!isValidSender(payload?.studentId, payload?.classroomId)) return;
      if (Date.now() - lastRaise < 1000) return;
      lastRaise = Date.now();
      io.to(classroomId).emit("raise_hand", {
        type: "raise_hand",
        studentId: userId,
        classroomId,
      });
    });

    socket.on("student_status_update", async (payload) => {
      if (!isValidSender(payload?.studentId, payload?.classroomId)) return;
      if (!statuses.has(payload.status) || typeof payload.moduleId !== "string")
        return;
      if (Date.now() - lastStatus < 500) return;
      if (!(await publishedModuleInClassroom(payload.moduleId, classroomId)))
        return;
      lastStatus = Date.now();
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
