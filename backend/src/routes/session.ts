import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth.js";
import { moduleInClassroom } from "../access.js";
import { supabase } from "../supabase.js";
import { emitSessionUpdate } from "../sockets.js";
import { toSession, unwrap, type SessionRow } from "../rows.js";
import type {
  GetSessionResponse,
  LessonPhase,
  LessonSession,
  StartSessionRequest,
  UpdateSessionRequest,
} from "../../../shared/types.js";

// The live lesson for the caller's classroom: mounted at /api/classrooms/:id/session.
export const sessionRouter = Router({ mergeParams: true });

const phases: LessonPhase[] = ["teach", "work"];

/** A token represents one selected classroom, so :id must be it. */
function inOwnClassroom(req: Request, res: Response): boolean {
  if (req.params.id !== req.user!.classroomId) {
    res.status(403).json({ error: "Not a member of this classroom" });
    return false;
  }
  return true;
}

async function liveRow(classroomId: string): Promise<SessionRow | null> {
  return unwrap(
    await supabase
      .from("lesson_sessions")
      .select("*")
      .eq("classroom_id", classroomId)
      .is("ended_at", null)
      .maybeSingle(),
  ) as SessionRow | null;
}

async function withTitle(row: SessionRow): Promise<LessonSession> {
  const module = unwrap(
    await supabase.from("modules").select("title").eq("id", row.module_id).maybeSingle(),
  ) as { title: string } | null;
  return toSession(row, module?.title ?? "Lesson");
}

/** Send the new state to the room, and back to the caller. */
function publish(res: Response, classroomId: string, session: LessonSession | null, status = 200): void {
  emitSessionUpdate(classroomId, session);
  const body: GetSessionResponse = { session };
  res.status(status).json(body);
}

sessionRouter.get("/", async (req, res) => {
  if (!inOwnClassroom(req, res)) return;
  const row = await liveRow(req.user!.classroomId);
  const body: GetSessionResponse = { session: row ? await withTitle(row) : null };
  res.json(body);
});

sessionRouter.post("/", requireRole("teacher"), async (req, res) => {
  if (!inOwnClassroom(req, res)) return;
  const classroomId = req.user!.classroomId;
  const { moduleId, phase = "teach" } = (req.body ?? {}) as Partial<StartSessionRequest>;
  if (typeof moduleId !== "string" || !phases.includes(phase)) {
    return res.status(400).json({ error: "moduleId and a valid phase are required" });
  }
  if (!(await moduleInClassroom(moduleId, classroomId))) {
    return res.status(404).json({ error: "Lesson not found" });
  }
  if (await liveRow(classroomId)) {
    return res.status(409).json({ error: "A lesson is already live. End it or move the class on." });
  }
  const row = unwrap(
    await supabase
      .from("lesson_sessions")
      .insert({ id: randomUUID(), classroom_id: classroomId, module_id: moduleId, phase, started_by: req.user!.userId })
      .select("*")
      .single(),
  ) as SessionRow;
  publish(res, classroomId, await withTitle(row), 201);
});

sessionRouter.patch("/", requireRole("teacher"), async (req, res) => {
  if (!inOwnClassroom(req, res)) return;
  const classroomId = req.user!.classroomId;
  const { moduleId, phase } = (req.body ?? {}) as UpdateSessionRequest;
  if (
    (moduleId !== undefined && typeof moduleId !== "string") ||
    (phase !== undefined && !phases.includes(phase)) ||
    (moduleId === undefined && phase === undefined)
  ) {
    return res.status(400).json({ error: "Provide a lesson and/or a phase" });
  }
  const current = await liveRow(classroomId);
  if (!current) return res.status(409).json({ error: "No lesson is live" });
  if (moduleId !== undefined && !(await moduleInClassroom(moduleId, classroomId))) {
    return res.status(404).json({ error: "Lesson not found" });
  }
  const row = unwrap(
    await supabase
      .from("lesson_sessions")
      .update({
        ...(moduleId !== undefined ? { module_id: moduleId } : {}),
        ...(phase !== undefined ? { phase } : {}),
      })
      .eq("id", current.id)
      .select("*")
      .single(),
  ) as SessionRow;
  publish(res, classroomId, await withTitle(row));
});

sessionRouter.delete("/", requireRole("teacher"), async (req, res) => {
  if (!inOwnClassroom(req, res)) return;
  const classroomId = req.user!.classroomId;
  unwrap(
    await supabase
      .from("lesson_sessions")
      .update({ ended_at: new Date().toISOString() })
      .eq("classroom_id", classroomId)
      .is("ended_at", null),
  );
  publish(res, classroomId, null);
});
