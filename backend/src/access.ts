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

/**
 * Resolves a module visible to this role. Students can never resolve drafts, or a live-only lesson that is not being taught.
 * The module must be in the caller's classroom, so the live-session lookup does not have to wait for the module row.
 */
export async function moduleForUser(
  id: string,
  classroomId: string,
  role: "student" | "teacher",
): Promise<ModuleRow | null> {
  if (role === "teacher") return moduleInClassroom(id, classroomId);
  const [module, live] = await Promise.all([
    moduleInClassroom(id, classroomId),
    liveModuleIds(classroomId),
  ]);
  return module && module.status === "published" && lessonOpen(module, live)
    ? module
    : null;
}

/**
 * Ids of every module this role can open in a classroom, in two parallel queries however many there are.
 * Use it instead of calling moduleForUser once per row.
 */
export async function visibleModuleIds(
  classroomId: string,
  role: "student" | "teacher",
): Promise<Set<string>> {
  const [modules, live] = await Promise.all([
    supabase
      .from("modules")
      .select("id,status,access")
      .eq("classroom_id", classroomId),
    role === "student" ? liveModuleIds(classroomId) : Promise.resolve(new Set<string>()),
  ]);
  const rows = unwrap(modules) as Array<Pick<ModuleRow, "id" | "status" | "access">>;
  return new Set(
    rows
      .filter((row) => role === "teacher" || (row.status === "published" && lessonOpen(row, live)))
      .map((row) => row.id),
  );
}

export async function studentInClassroom(
  id: string,
  classroomId: string,
): Promise<UserRow | null> {
  const row = unwrap(
    await supabase
      .from("memberships")
      .select("role, users!inner(*)")
      .eq("user_id", id)
      .eq("classroom_id", classroomId)
      .eq("role", "student")
      .maybeSingle(),
  ) as { role: string; users: UserRow } | null;
  return row?.users ?? null;
}

export function isStudentOwner(
  user: NonNullable<Express.Request["user"]>,
  studentId: string,
): boolean {
  return user.role === "student" && user.userId === studentId;
}
