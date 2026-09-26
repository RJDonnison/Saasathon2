import { randomUUID } from "node:crypto";
import { Router } from "express";
import { supabase } from "../supabase.js";
import { applyClassroomAssignments, findProfile, requireIdentity } from "../auth.js";
import {
  toUser,
  unwrap,
  type ClassroomRow,
  type MembershipRow,
  type UserRow,
} from "../rows.js";
import type {
  JoinRequest,
  JoinResponse,
  MeResponse,
} from "../../../shared/types.js";

// Both routes need a valid Supabase session but NOT a classroom (that is what /join creates).
export const authRouter = Router();

/** POST /api/auth/join — resolve a signed-in user's membership, creating a role-appropriate default when needed. */
authRouter.post("/join", requireIdentity, async (req, res) => {
  const { roomCode, role } = (req.body ?? {}) as Partial<JoinRequest>;
  const cleanCode =
    typeof roomCode === "string" ? roomCode.trim().toUpperCase() : "";
  if (role !== "teacher" && role !== "student") {
    res.status(400).json({ error: "A valid classroom role is required" });
    return;
  }
  const { authId, name } = req.identity!;
  let classroom: ClassroomRow | null;
  if (cleanCode) {
    classroom = unwrap(
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
  } else if (role === "student") {
    // A new student gets the seeded starter classroom immediately. Teacher roster assignments
    // can move them into their actual class the next time /me runs.
    classroom = unwrap(
      await supabase
        .from("classrooms")
        .select("*")
        .eq("id", "classroom-demo")
        .maybeSingle(),
    ) as ClassroomRow | null;
    if (!classroom) {
      res.status(503).json({ error: "The starter classroom is unavailable" });
      return;
    }
  } else {
    // Give each new teacher a private classroom so sign-in can finish without a shared code.
    const classroomId = `classroom-${authId}`;
    const prior = unwrap(
      await supabase
        .from("classrooms")
        .select("*")
        .eq("id", classroomId)
        .maybeSingle(),
    ) as ClassroomRow | null;
    classroom = prior ?? (unwrap(
      await supabase
        .from("classrooms")
        .upsert({
          id: classroomId,
          name: `${name}'s Classroom`,
          room_code: `LOOP${randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase()}`,
        }, { onConflict: "id" })
        .select("*")
        .single(),
    ) as ClassroomRow);
  }

  const row = unwrap(
    await supabase
      .from("users")
      .upsert({ id: authId, name, email: req.identity!.email }, { onConflict: "id" })
      .select("*")
      .single(),
  ) as UserRow;

  const membership = unwrap(
    await supabase
      .from("memberships")
      .upsert(
        {
          id: randomUUID(),
          user_id: authId,
          classroom_id: classroom.id,
          role,
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,classroom_id" },
      )
      .select("*")
      .single(),
  ) as MembershipRow;

  const body: JoinResponse = { user: toUser(row, membership) };
  res.json(body);
});

/** GET /api/auth/me — the signed-in user's classroom profile, or null if they haven't joined yet. */
authRouter.get("/me", requireIdentity, async (req, res) => {
  await applyClassroomAssignments(req.identity!);
  const body: MeResponse = { user: await findProfile(req.identity!.authId) };
  res.json(body);
});
