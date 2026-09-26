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

/** POST /api/auth/join — teacher bootstrap into a classroom. Students enter via the teacher email roster. */
authRouter.post("/join", requireIdentity, async (req, res) => {
  const { roomCode, role } = (req.body ?? {}) as Partial<JoinRequest>;
  const cleanCode =
    typeof roomCode === "string" ? roomCode.trim().toUpperCase() : "";
  if (role !== "teacher") {
    res.status(403).json({ error: "Students are assigned by their teacher using their school email" });
    return;
  }
  if (!cleanCode) {
    res
      .status(400)
      .json({ error: "A classroom code is required for teacher setup" });
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

  const { authId, name } = req.identity!;
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
