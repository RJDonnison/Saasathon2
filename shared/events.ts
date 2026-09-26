// Single source of truth for socket.io event payloads.
// Plain file (not an npm package) — imported by relative path from backend and frontend.

export type StudentStatus = "idle" | "working" | "stuck";

export interface RaiseHandPayload {
  type: "raise_hand";
  studentId: string;
  classroomId: string;
}

export interface StudentStatusUpdatePayload {
  type: "student_status_update";
  studentId: string;
  classroomId: string;
  status: StudentStatus;
  moduleId: string;
}

export interface PresenceUpdatePayload {
  type: "presence_update";
  classroomId: string;
  onlineStudentIds: string[];
}
export interface ModuleChangedPayload {
  type: "module_changed";
  classroomId: string;
  moduleId: string;
  revision: number;
}
export interface ModuleDeletedPayload {
  type: "module_deleted";
  classroomId: string;
  moduleId: string;
}

/** Discriminated union (on `type`) of every socket payload. */
export type SocketPayload =
  | RaiseHandPayload
  | StudentStatusUpdatePayload
  | PresenceUpdatePayload
  | ModuleChangedPayload
  | ModuleDeletedPayload;

/** Events the client emits -> server. */
export interface ClientToServerEvents {
  raise_hand: (payload: RaiseHandPayload) => void;
  student_status_update: (payload: StudentStatusUpdatePayload) => void;
}

/** Events the server emits -> clients. */
export interface ServerToClientEvents {
  raise_hand: (payload: RaiseHandPayload) => void;
  student_status_update: (payload: StudentStatusUpdatePayload) => void;
  presence_update: (payload: PresenceUpdatePayload) => void;
  module_changed: (payload: ModuleChangedPayload) => void;
  module_deleted: (payload: ModuleDeletedPayload) => void;
}
