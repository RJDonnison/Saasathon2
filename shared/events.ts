// Single source of truth for socket.io event payloads.
// Plain file (not an npm package) — imported by relative path from backend and frontend.

import type { StudentActivity, StudentWork } from "./types.js";

export type StudentStatus = "idle" | "working" | "stuck";

export interface RaiseHandPayload {
  type: "raise_hand";
  studentId: string;
  classroomId: string;
}

export interface AcknowledgeHandPayload {
  type: "acknowledge_hand";
  studentId: string;
  classroomId: string;
}

export interface RaisedHand {
  studentId: string;
  raisedAt: number;
}

/** The complete set of unacknowledged hands for one classroom. */
export interface RaisedHandsUpdatePayload {
  type: "raised_hands_update";
  classroomId: string;
  hands: RaisedHand[];
}

export interface StudentStatusUpdatePayload {
  type: "student_status_update";
  studentId: string;
  classroomId: string;
  status: StudentStatus;
  moduleId: string;
}
/** Broadcast when a student changes location, saves work, or takes a meaningful learning action. */
export interface StudentActivityUpdatePayload {
  type: "student_activity_update";
  classroomId: string;
  studentId: string;
  active: StudentActivity;
  /** Present for a meaningful logged action; draft saves only refresh `active`. */
  activity?: StudentActivity;
  /** Present when a draft was saved, so the selected teacher view stays in sync. */
  work?: StudentWork;
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

/** Discriminated union (on `type`) of every socket payload. */
export type SocketPayload =
  | RaiseHandPayload
  | AcknowledgeHandPayload
  | RaisedHandsUpdatePayload
  | StudentStatusUpdatePayload
  | StudentActivityUpdatePayload
  | PresenceUpdatePayload
  | ModuleChangedPayload;

/** Events the client emits -> server. */
export interface ClientToServerEvents {
  raise_hand: (payload: RaiseHandPayload) => void;
  acknowledge_hand: (payload: AcknowledgeHandPayload) => void;
  student_status_update: (payload: StudentStatusUpdatePayload) => void;
}

/** Events the server emits -> clients. */
export interface ServerToClientEvents {
  raised_hands_update: (payload: RaisedHandsUpdatePayload) => void;
  student_status_update: (payload: StudentStatusUpdatePayload) => void;
  student_activity_update: (payload: StudentActivityUpdatePayload) => void;
  presence_update: (payload: PresenceUpdatePayload) => void;
  module_changed: (payload: ModuleChangedPayload) => void;
}
