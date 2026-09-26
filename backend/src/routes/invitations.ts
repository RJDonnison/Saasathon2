import { randomUUID } from "node:crypto";
import { Router } from "express";
import { supabase } from "../supabase.js";
import { membershipFor } from "../access.js";
import {
  toUser,
  unwrap,
  type ClassroomRow,
  type InvitationRow,
  type MembershipRow,
  type UserRow,
} from "../rows.js";
import type {
  AcceptInvitationResponse,
  ListMyInvitationsResponse,
} from "../../../shared/types.js";

// The invited student's side. Needs a valid Google session but NOT a classroom (mounted before requireMember),
// and only ever touches invitations addressed to the caller's own verified email.
export const invitationsRouter = Router();

async function pendingInvitation(email: string, id: string): Promise<InvitationRow | null> {
  if (!email) return null;
  return unwrap(
    await supabase
      .from("classroom_invitations")
      .select("*")
      .eq("id", id)
      .eq("email", email)
      .eq("status", "pending")
      .maybeSingle(),
  ) as InvitationRow | null;
}

/** GET /api/invitations — pending invitations for the signed-in user's email. */
invitationsRouter.get("/", async (req, res) => {
  const { email } = req.identity!;
  const rows = email
    ? (unwrap(
        await supabase
          .from("classroom_invitations")
          .select("*")
          .eq("email", email)
          .eq("status", "pending")
          .order("created_at", { ascending: false }),
      ) as InvitationRow[])
    : [];
  const classrooms = rows.length
    ? (unwrap(
        await supabase
          .from("classrooms")
          .select("*")
          .in("id", [...new Set(rows.map((r) => r.classroom_id))]),
      ) as ClassroomRow[])
    : [];
  const teachers = rows.length
    ? (unwrap(
        await supabase
          .from("users")
          .select("id,name")
          .in("id", [...new Set(rows.map((r) => r.invited_by))]),
      ) as Pick<UserRow, "id" | "name">[])
    : [];
  const body: ListMyInvitationsResponse = rows.map((r) => ({
    id: r.id,
    classroomId: r.classroom_id,
    classroomName: classrooms.find((c) => c.id === r.classroom_id)?.name ?? "A classroom",
    invitedByName: teachers.find((t) => t.id === r.invited_by)?.name ?? "Your teacher",
    createdAt: r.created_at,
  }));
  res.json(body);
});

/** POST /api/invitations/:id/accept — the only way an invitation turns into a membership. */
invitationsRouter.post("/:id/accept", async (req, res) => {
  const { authId, name, email } = req.identity!;
  const invitation = await pendingInvitation(email, String(req.params.id));
  if (!invitation) return res.status(404).json({ error: "Invitation not found" });

  const prior = await membershipFor(authId, invitation.classroom_id);
  if (prior?.role === "teacher") {
    return res.status(409).json({ error: "You already teach this classroom" });
  }

  const user = unwrap(
    await supabase
      .from("users")
      .upsert({ id: authId, name, email }, { onConflict: "id" })
      .select("*")
      .single(),
  ) as UserRow;
  // A fresh timestamp makes this classroom the caller's active one (see findProfile).
  const membership = unwrap(
    await supabase
      .from("memberships")
      .upsert(
        {
          id: prior?.id ?? randomUUID(),
          user_id: authId,
          classroom_id: invitation.classroom_id,
          role: "student",
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,classroom_id" },
      )
      .select("*")
      .single(),
  ) as MembershipRow;
  unwrap(
    await supabase
      .from("classroom_invitations")
      .update({ status: "accepted", user_id: authId, responded_at: new Date().toISOString() })
      .eq("id", invitation.id),
  );

  const body: AcceptInvitationResponse = { user: toUser(user, membership) };
  res.json(body);
});

/** POST /api/invitations/:id/decline — leaves the student out of the classroom; the teacher can re-invite later. */
invitationsRouter.post("/:id/decline", async (req, res) => {
  const invitation = await pendingInvitation(req.identity!.email, String(req.params.id));
  if (!invitation) return res.status(404).json({ error: "Invitation not found" });
  unwrap(
    await supabase
      .from("classroom_invitations")
      .update({ status: "declined", responded_at: new Date().toISOString() })
      .eq("id", invitation.id),
  );
  res.status(204).end();
});
