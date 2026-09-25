import { randomUUID } from "node:crypto";
import { Router } from "express";
import { supabase } from "../supabase.js";
import {
  toUser,
  unwrap,
  type ClassroomRow,
  type MembershipRow,
  type UserRow,
} from "../rows.js";
import { requireAuth, signToken } from "../auth.js";
import type {
  JoinRequest,
  JoinResponse,
  MeResponse,
} from "../../../shared/types.js";

/** Escape LIKE wildcards so a name is matched literally by ilike (case-insensitive equality). */
const escapeLike = (s: string) => s.replace(/[\\%_]/g, "\\$&");

/** Public: POST /api/auth/join */
export const publicAuthRouter = Router();

publicAuthRouter.post("/join", async (req, res) => {
  const { roomCode, name, role } = (req.body ?? {}) as Partial<JoinRequest>;
  const cleanName = typeof name === "string" ? name.trim() : "";
  const cleanCode =
    typeof roomCode === "string" ? roomCode.trim().toUpperCase() : "";

  if (!cleanName || !cleanCode || (role !== "student" && role !== "teacher")) {
    res.status(400).json({
      error: "roomCode, name and role (student|teacher) are required",
    });
    return;
  }

  const classroom = unwrap(
    await supabase
      .from("classrooms")
      .select("*")
      .eq("room_code", cleanCode)
      .maybeSingle(),
  ) as ClassroomRow | null;
  if (!classroom) {
    res.status(404).json({ error: "Unknown room code" });
    return;
  }

  // Reuse a classroom membership for the same name/role; users are global and may have many memberships.
  const findMembership = async () =>
    unwrap(
      await supabase
        .from("memberships")
        .select("*, users!inner(*)")
        .eq("classroom_id", classroom.id)
        .eq("role", role)
        .ilike("users.name", escapeLike(cleanName))
        .maybeSingle(),
    ) as (MembershipRow & { users: UserRow }) | null;

  let found = await findMembership();
  if (!found) {
    // With passwordless room-code auth, a case-insensitive name is the only available
    // cross-classroom identity signal. Reuse it so the same person can join many rooms.
    const matchingUsers = unwrap(
      await supabase
        .from("users")
        .select("*")
        .ilike("name", escapeLike(cleanName))
        .limit(1),
    ) as UserRow[];
    let createdUser = matchingUsers[0] ?? null;
    if (!createdUser) {
      createdUser = unwrap(
        await supabase
          .from("users")
          .insert({ id: randomUUID(), name: cleanName })
          .select("*")
          .single(),
      ) as UserRow;
    }
    const createdMembership = await supabase
      .from("memberships")
      .insert({
        id: randomUUID(),
        user_id: createdUser.id,
        classroom_id: classroom.id,
        role,
      })
      .select("*")
      .single();
    if (createdMembership.error?.code === "23505") {
      // A simultaneous join won. The orphan global user is harmless and has no membership.
      found = await findMembership();
    } else {
      found = {
        ...(unwrap(createdMembership) as MembershipRow),
        users: createdUser,
      };
    }
  }
  if (!found) throw new Error("Could not create or find membership");

  const user = toUser(found.users, found);
  const body: JoinResponse = {
    token: signToken({
      userId: user.id,
      membershipId: user.membershipId,
      role: user.role,
      classroomId: user.classroomId,
    }),
    user,
  };
  res.json(body);
});

/** Protected: GET /api/auth/me */
export const meRouter = Router();

meRouter.get("/me", requireAuth, async (req, res) => {
  const [row, membership] = (await Promise.all([
    supabase.from("users").select("*").eq("id", req.user!.userId).maybeSingle(),
    supabase
      .from("memberships")
      .select("*")
      .eq("id", req.user!.membershipId)
      .eq("user_id", req.user!.userId)
      .maybeSingle(),
  ]).then((results) => results.map(unwrap))) as [
    UserRow | null,
    MembershipRow | null,
  ];
  if (
    !row ||
    !membership ||
    membership.classroom_id !== req.user!.classroomId ||
    membership.role !== req.user!.role
  ) {
    res.status(401).json({ error: "User no longer exists" });
    return;
  }
  const body: MeResponse = { user: toUser(row, membership) };
  res.json(body);
});
