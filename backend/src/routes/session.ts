import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { requireRole } from "../auth.js";
import { moduleInClassroom } from "../access.js";
import { supabase } from "../supabase.js";
import { emitSessionUpdate } from "../sockets.js";
import { liveModuleAggregates } from "../questionOutcomes.js";
import { toSession, unwrap, type SessionRow } from "../rows.js";
import type {
  GetSessionResponse,
  GetLiveModuleProgressResponse,
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

/** A session row with its lesson title joined in, so the title never costs a second query. */
type SessionWithTitle = SessionRow & { modules: { title: string } | null };
const SESSION_SELECT = "*, modules(title)";

async function liveRow(classroomId: string): Promise<SessionWithTitle | null> {
  return unwrap(
    await supabase
      .from("lesson_sessions")
      .select(SESSION_SELECT)
      .eq("classroom_id", classroomId)
      .is("ended_at", null)
      .maybeSingle(),
  ) as SessionWithTitle | null;
}

function toView(row: SessionWithTitle): LessonSession {
  const { modules, ...session } = row;
  return toSession(session, modules?.title ?? "Lesson");
}

async function recordSessionModule(
  row: SessionRow,
  title: string,
): Promise<void> {
  try {
    unwrap(
      await supabase.from("lesson_feedback_events").insert({
        id: randomUUID(),
        session_id: row.id,
        classroom_id: row.classroom_id,
        student_id: null,
        module_id: row.module_id,
        event_type: "lesson_module",
        payload: { title },
      }),
    );
  } catch (error) {
    console.warn(
      "[feedback] Could not record lesson change:",
      error instanceof Error ? error.message : error,
    );
  }
}

/** Send the new state to the room, and back to the caller. */
function publish(
  res: Response,
  classroomId: string,
  session: LessonSession | null,
  status = 200,
): void {
  emitSessionUpdate(classroomId, session);
  const body: GetSessionResponse = { session };
  res.status(status).json(body);
}

sessionRouter.get("/", async (req, res) => {
  if (!inOwnClassroom(req, res)) return;
  const row = await liveRow(req.user!.classroomId);
  const body: GetSessionResponse = { session: row ? toView(row) : null };
  res.json(body);
});

/** Teacher roll-call snapshot for the module currently being taught. */
sessionRouter.get("/progress", requireRole("teacher"), async (req, res) => {
  if (!inOwnClassroom(req, res)) return;
  const [session, membershipsResult] = await Promise.all([
    liveRow(req.user!.classroomId),
    supabase
      .from("memberships")
      .select("user_id")
      .eq("classroom_id", req.user!.classroomId)
      .eq("role", "student"),
  ]);
  if (!session) return res.status(409).json({ error: "No lesson is live" });
  const memberships = unwrap(membershipsResult) as Array<{ user_id: string }>;
  const studentIds = memberships.map((membership) => membership.user_id);
  const body: GetLiveModuleProgressResponse = {
    sessionId: session.id,
    moduleId: session.module_id,
    progress: await liveModuleAggregates(session.module_id, studentIds),
    version: new Date().toISOString(),
  };
  res.json(body);
});

sessionRouter.post("/", requireRole("teacher"), async (req, res) => {
  if (!inOwnClassroom(req, res)) return;
  const classroomId = req.user!.classroomId;
  const { moduleId, phase = "teach" } = (req.body ??
    {}) as Partial<StartSessionRequest>;
  if (typeof moduleId !== "string" || !phases.includes(phase)) {
    return res
      .status(400)
      .json({ error: "moduleId and a valid phase are required" });
  }
  const [lesson, running] = await Promise.all([
    moduleInClassroom(moduleId, classroomId),
    liveRow(classroomId),
  ]);
  if (!lesson) {
    return res.status(404).json({ error: "Lesson not found" });
  }
  if (running) {
    return res.status(409).json({
      error: "A lesson is already live. End it or move the class on.",
    });
  }
  const row = unwrap(
    await supabase
      .from("lesson_sessions")
      .insert({
        id: randomUUID(),
        classroom_id: classroomId,
        module_id: moduleId,
        phase,
        started_by: req.user!.userId,
      })
      .select(SESSION_SELECT)
      .single(),
  ) as SessionWithTitle;
  const view = toView(row);
  // Best-effort log line (it swallows its own errors); the teacher doesn't wait for it.
  void recordSessionModule(row, view.moduleTitle);
  publish(res, classroomId, view, 201);
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
  const [current, lesson] = await Promise.all([
    liveRow(classroomId),
    moduleId !== undefined
      ? moduleInClassroom(moduleId, classroomId)
      : Promise.resolve(true),
  ]);
  if (!current) return res.status(409).json({ error: "No lesson is live" });
  if (!lesson) {
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
      .select(SESSION_SELECT)
      .single(),
  ) as SessionWithTitle;
  const view = toView(row);
  if (row.module_id !== current.module_id)
    void recordSessionModule(row, view.moduleTitle);
  publish(res, classroomId, view);
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
