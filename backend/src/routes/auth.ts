import { Router } from "express";
import { findProfile, requireIdentity } from "../auth.js";
import type { MeResponse } from "../../../shared/types.js";

// Needs a valid Supabase session but NOT a classroom (a new user has none until they create or accept one).
export const authRouter = Router();

/** GET /api/auth/me — the signed-in user's classroom profile, or null if they have no classroom yet. */
authRouter.get("/me", requireIdentity, async (req, res) => {
  const body: MeResponse = { user: await findProfile(req.identity!.authId) };
  res.json(body);
});
