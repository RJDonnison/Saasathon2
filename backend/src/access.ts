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

/** Whether now falls inside the lesson's teacher-chosen window (either end may be open). */
export function inLessonWindow(
  module: Pick<ModuleRow, "opens_at" | "closes_at">,
  now = Date.now(),
): boolean {
  return (
    (!module.opens_at || Date.parse(module.opens_at) <= now) &&
    (!module.closes_at || now < Date.parse(module.closes_at))
  );
}

/** Ids of lessons the teacher is running live right now; a live lesson is open whatever its window says. */
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

/** Whether students may open this lesson now: inside its window, or the teacher is running it live. */
export async function lessonOpenForStudents(module: ModuleRow): Promise<boolean> {
  if (inLessonWindow(module)) return true;
  return (await liveModuleIds(module.classroom_id)).has(module.id);
}

/** Resolves a module visible to this role. Students can never resolve drafts or lessons outside their window. */
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
