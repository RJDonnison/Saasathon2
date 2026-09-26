import { supabase } from "./supabase.js";
import {
  unwrap,
  type MembershipRow,
  type ModuleRow,
  type UserRow,
} from "./rows.js";

export async function membershipFor(
  userId: string,
  classroomId: string,
): Promise<MembershipRow | null> {
  return unwrap(
    await supabase
      .from("memberships")
      .select("*")
      .eq("user_id", userId)
      .eq("classroom_id", classroomId)
      .maybeSingle(),
  ) as MembershipRow | null;
}

export async function moduleInClassroom(
  id: string,
  classroomId: string,
): Promise<ModuleRow | null> {
  return unwrap(
    await supabase
      .from("modules")
      .select("*")
      .eq("id", id)
      .eq("classroom_id", classroomId)
      .maybeSingle(),
  ) as ModuleRow | null;
}

/** Whether a lesson is open to students given which lessons are live right now. */
export function lessonOpen(
  module: Pick<ModuleRow, "id" | "access">,
  live: Set<string>,
): boolean {
  return module.access !== "live" || live.has(module.id);
}

/** Ids of lessons the teacher is running live right now (at most one per classroom). */
export async function liveModuleIds(classroomId: string): Promise<Set<string>> {
  const rows = unwrap(
    await supabase
      .from("lesson_sessions")
      .select("module_id")
      .eq("classroom_id", classroomId)
      .is("ended_at", null),
  ) as Array<{ module_id: string }>;
  return new Set(rows.map((row) => row.module_id));
}

/** Whether students may open this lesson now: it is open any time, or the teacher is teaching it live. */
export async function lessonOpenForStudents(module: ModuleRow): Promise<boolean> {
  if (module.access !== "live") return true;
  return (await liveModuleIds(module.classroom_id)).has(module.id);
}

/** Resolves a module visible to this role. Students can never resolve drafts, or a live-only lesson that is not being taught. */
export async function moduleForUser(
  id: string,
  classroomId: string,
  role: "student" | "teacher",
): Promise<ModuleRow | null> {
  const module = await moduleInClassroom(id, classroomId);
  if (!module) return null;
  if (role === "teacher") return module;
  return module.status === "published" && (await lessonOpenForStudents(module))
    ? module
    : null;
}

export async function studentInClassroom(
  id: string,
  classroomId: string,
): Promise<UserRow | null> {
  const membership = await membershipFor(id, classroomId);
  if (!membership || membership.role !== "student") return null;
  return unwrap(
    await supabase.from("users").select("*").eq("id", id).maybeSingle(),
  ) as UserRow | null;
}

export function isStudentOwner(
  user: NonNullable<Express.Request["user"]>,
  studentId: string,
): boolean {
  return user.role === "student" && user.userId === studentId;
}
