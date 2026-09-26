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

/** Resolves a module visible to this role. Students can never resolve drafts. */
export async function moduleForUser(
  id: string,
  classroomId: string,
  role: "student" | "teacher",
): Promise<ModuleRow | null> {
  const module = await moduleInClassroom(id, classroomId);
  return module && (role === "teacher" || module.status === "published")
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
