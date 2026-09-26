import type { NextFunction, Request, RequestHandler, Response } from "express";
import { randomUUID } from "node:crypto";
import { supabase } from "./supabase.js";
import { toUser, unwrap, type MembershipRow, type UserRow } from "./rows.js";
import type { Role, User } from "../../shared/types.js";

// Auth is Supabase Auth (Google OAuth). The browser signs in and sends its Supabase access token;
// we never mint tokens. Two levels:
//   identity — a valid Supabase session (someone signed in with Google)
//   member   — identity that has also joined a classroom, with role + classroom carried by a membership

/** Who is signed in (from Supabase Auth). */
export interface AuthIdentity {
  authId: string;
  name: string;
  email: string;
}

/** A signed-in user who has joined a classroom. Role and classroom are read from the DB, not the token. */
export interface AuthUser {
  userId: string;
  membershipId: string;
  role: Role;
  classroomId: string;
}

declare global {
  namespace Express {
    interface Request {
      identity?: AuthIdentity;
      user?: AuthUser;
    }
  }
}

// Tokens are validated against Supabase Auth (getUser), which also honours sign-out/revocation.
// A short cache avoids a network round trip on every request.
const CACHE_TTL_MS = 30_000;
const CACHE_MAX = 500;
const cache = new Map<string, { identity: AuthIdentity; expires: number }>();

/** Validate a Supabase access token. Returns null if it is missing, invalid or expired. */
export async function verifyToken(token: string): Promise<AuthIdentity | null> {
  const hit = cache.get(token);
  if (hit && hit.expires > Date.now()) return hit.identity;
  cache.delete(token);

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  const meta = data.user.user_metadata as
    { full_name?: string; name?: string } | undefined;
  const fallback = data.user.email?.split("@")[0] ?? "Student";
  const identity: AuthIdentity = {
    authId: data.user.id,
    name: (meta?.full_name ?? meta?.name ?? fallback).trim(),
    email: (data.user.email ?? "").trim().toLowerCase(),
  };

  if (cache.size >= CACHE_MAX) cache.clear();
  cache.set(token, { identity, expires: Date.now() + CACHE_TTL_MS });
  return identity;
}

/** Create student memberships for email roster entries that match this Google identity. */
export async function applyClassroomAssignments(identity: AuthIdentity): Promise<void> {
  if (!identity.email) return;
  unwrap(
    await supabase.from("users").upsert(
      { id: identity.authId, name: identity.name, email: identity.email },
      { onConflict: "id" },
    ),
  );

  const assignments = unwrap(
    await supabase
      .from("classroom_assignments")
      .select("id,classroom_id,student_id")
      .eq("email", identity.email),
  ) as Array<{ id: string; classroom_id: string; student_id: string | null }>;

  for (const assignment of assignments) {
    // Never transfer an assignment already claimed by a different authenticated account.
    if (assignment.student_id && assignment.student_id !== identity.authId) continue;
    const prior = unwrap(
      await supabase
        .from("memberships")
        .select("id,role")
        .eq("user_id", identity.authId)
        .eq("classroom_id", assignment.classroom_id)
        .maybeSingle(),
    ) as { id: string; role: Role } | null;
    if (prior?.role === "teacher") continue;

    unwrap(
      await supabase.from("memberships").upsert(
        {
          id: prior?.id ?? randomUUID(),
          user_id: identity.authId,
          classroom_id: assignment.classroom_id,
          role: "student",
          created_at: new Date().toISOString(),
        },
        { onConflict: "user_id,classroom_id" },
      ),
    );
    unwrap(
      await supabase
        .from("classroom_assignments")
        .update({ student_id: identity.authId })
        .eq("id", assignment.id),
    );
  }
}

/** The classroom profile for a signed-in user, or null if they haven't joined one yet. */
export async function findProfile(authId: string): Promise<User | null> {
  const row = unwrap(
    await supabase.from("users").select("*").eq("id", authId).maybeSingle(),
  ) as UserRow | null;
  if (!row) return null;
  // The most recently joined membership is the active classroom. Joining an existing
  // classroom refreshes its timestamp, so it also switches the active membership.
  const membership = unwrap(
    await supabase
      .from("memberships")
      .select("*")
      .eq("user_id", authId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ) as MembershipRow | null;
  return membership ? toUser(row, membership) : null;
}

function bearer(req: Request): string | null {
  const [scheme, token] = (req.headers.authorization ?? "").split(" ");
  return scheme === "Bearer" && token ? token : null;
}

/** Requires a valid Supabase session; attaches req.identity. */
export const requireIdentity: RequestHandler = async (req, res, next) => {
  const token = bearer(req);
  const identity = token ? await verifyToken(token) : null;
  if (!identity) {
    res.status(401).json({ error: "Missing or invalid token" });
    return;
  }
  req.identity = identity;
  next();
};

/** Requires a valid session AND a joined classroom; attaches req.identity and req.user. */
export const requireMember: RequestHandler = async (req, res, next) => {
  await requireIdentity(req, res, async () => {
    const profile = await findProfile(req.identity!.authId);
    if (!profile) {
      res.status(403).json({ error: "Join a classroom first" });
      return;
    }
    req.user = {
      userId: profile.id,
      membershipId: profile.membershipId,
      role: profile.role,
      classroomId: profile.classroomId,
    };
    next();
  });
};

export function requireRole(role: Role) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.user?.role !== role) {
      res.status(403).json({ error: `Requires ${role} role` });
      return;
    }
    next();
  };
}
