import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireRole } from "../auth.js";
import { membershipFor } from "../access.js";
import { supabase } from "../supabase.js";
import { toTeacherLessonPlan, unwrap, type TeacherLessonPlanRow } from "../rows.js";
import type {
  LessonPlanDocument,
  LessonPlanStatus,
  SaveTeacherLessonPlanRequest,
} from "../../../shared/types.js";

export const lessonPlansRouter = Router();
lessonPlansRouter.use(requireRole("teacher"));

function validDocument(value: unknown): value is LessonPlanDocument {
  if (!value || typeof value !== "object") return false;
  const doc = value as Partial<LessonPlanDocument>;
  const fields: Array<keyof LessonPlanDocument> = [
    "title", "framework", "yearLevel", "learningArea", "curriculumFocus",
    "walt", "wilf", "tib", "culturalContext", "priorLearning", "learnerNeeds",
    "resources", "assessmentEvidence", "relieverBriefing", "reflection",
  ];
  return fields.every((key) => typeof doc[key] === "string") &&
    Array.isArray(doc.keyCompetencies) && doc.keyCompetencies.every((x) => typeof x === "string") &&
    Array.isArray(doc.sequence) && doc.sequence.length <= 10 && doc.sequence.every((item) =>
      !!item && typeof item.phase === "string" && typeof item.duration === "string" &&
      typeof item.teacherMoves === "string" && typeof item.studentTask === "string" &&
      typeof item.support === "string");
}

function validStatus(value: unknown): value is LessonPlanStatus {
  return value === "draft" || value === "planned" || value === "taught";
}
function validDate(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

lessonPlansRouter.get("/", async (req, res) => {
  const memberships = unwrap(await supabase.from("memberships").select("classroom_id")
    .eq("user_id", req.user!.userId).eq("role", "teacher")) as Array<{ classroom_id: string }>;
  const classroomIds = memberships.map((row) => row.classroom_id);
  if (!classroomIds.length) return res.json([]);
  const rows = unwrap(await supabase.from("teacher_lesson_plans").select("*")
    .eq("teacher_id", req.user!.userId).in("classroom_id", classroomIds)
    .order("updated_at", { ascending: false })) as TeacherLessonPlanRow[];
  const classrooms = unwrap(await supabase.from("classrooms").select("id,name")
    .in("id", classroomIds)) as Array<{ id: string; name: string }>;
  const names = new Map(classrooms.map((classroom) => [classroom.id, classroom.name]));
  res.json(rows.map((row) => toTeacherLessonPlan(row, names.get(row.classroom_id) ?? "Classroom")));
});

lessonPlansRouter.post("/", async (req, res) => {
  const body = (req.body ?? {}) as Partial<SaveTeacherLessonPlanRequest>;
  if (!validDocument(body.document) || !validStatus(body.status) || !validDate(body.lessonDate)) {
    res.status(400).json({ error: "A valid lesson plan, status and optional date are required" });
    return;
  }
  const now = new Date().toISOString();
  const row = unwrap(await supabase.from("teacher_lesson_plans").insert({
    id: randomUUID(), classroom_id: req.user!.classroomId, teacher_id: req.user!.userId,
    title: body.document.title.trim().slice(0, 200) || "Untitled lesson",
    document: body.document, status: body.status, lesson_date: body.lessonDate ?? null, module_id: null,
    taught_at: body.status === "taught" ? now : null,
  }).select("*").single()) as TeacherLessonPlanRow;
  const classroom = unwrap(await supabase.from("classrooms").select("name")
    .eq("id", req.user!.classroomId).single()) as { name: string };
  res.status(201).json(toTeacherLessonPlan(row, classroom.name));
});

lessonPlansRouter.put("/:id", async (req, res) => {
  const body = (req.body ?? {}) as Partial<SaveTeacherLessonPlanRequest>;
  if (!validDocument(body.document) || !validStatus(body.status) || !validDate(body.lessonDate) ||
      (body.moduleId !== undefined && body.moduleId !== null && typeof body.moduleId !== "string")) {
    res.status(400).json({ error: "A valid lesson plan, status and optional date are required" });
    return;
  }
  const existing = unwrap(await supabase.from("teacher_lesson_plans").select("taught_at,classroom_id,module_id")
    .eq("id", req.params.id).eq("teacher_id", req.user!.userId)
    .maybeSingle()) as Pick<TeacherLessonPlanRow, "taught_at" | "classroom_id" | "module_id"> | null;
  if (!existing) return res.status(404).json({ error: "Lesson plan not found" });
  const membership = await membershipFor(req.user!.userId, existing.classroom_id);
  if (membership?.role !== "teacher") return res.status(404).json({ error: "Lesson plan not found" });
  if (body.moduleId) {
    const linkedModule = unwrap(await supabase.from("modules").select("id")
      .eq("id", body.moduleId).eq("classroom_id", existing.classroom_id).maybeSingle()) as { id: string } | null;
    if (!linkedModule) return res.status(404).json({ error: "Student module not found in this classroom" });
  }
  const row = unwrap(await supabase.from("teacher_lesson_plans").update({
    title: body.document.title.trim().slice(0, 200) || "Untitled lesson",
    document: body.document, status: body.status, lesson_date: body.lessonDate ?? null,
    taught_at: body.status === "taught" ? existing.taught_at ?? new Date().toISOString() : null,
    module_id: body.moduleId === undefined ? existing.module_id : body.moduleId,
    updated_at: new Date().toISOString(),
  }).eq("id", req.params.id).eq("teacher_id", req.user!.userId)
    .eq("classroom_id", existing.classroom_id).select("*").single()) as TeacherLessonPlanRow;
  const classroom = unwrap(await supabase.from("classrooms").select("name")
    .eq("id", existing.classroom_id).single()) as { name: string };
  res.json(toTeacherLessonPlan(row, classroom.name));
});

lessonPlansRouter.post("/:id/module", async (req, res) => {
  const moduleId = typeof req.body?.moduleId === "string" ? req.body.moduleId.trim() : "";
  if (!moduleId) return res.status(400).json({ error: "A module id is required" });
  const plan = unwrap(await supabase.from("teacher_lesson_plans").select("classroom_id")
    .eq("id", req.params.id).eq("teacher_id", req.user!.userId).maybeSingle()) as { classroom_id: string } | null;
  if (!plan) return res.status(404).json({ error: "Lesson plan not found" });
  const membership = await membershipFor(req.user!.userId, plan.classroom_id);
  if (membership?.role !== "teacher") return res.status(404).json({ error: "Lesson plan not found" });
  const module = unwrap(await supabase.from("modules").select("id")
    .eq("id", moduleId).eq("classroom_id", plan.classroom_id).maybeSingle()) as { id: string } | null;
  if (!module) return res.status(404).json({ error: "Student module not found in this classroom" });
  unwrap(await supabase.from("teacher_lesson_plans").update({ module_id: moduleId, updated_at: new Date().toISOString() })
    .eq("id", req.params.id).eq("teacher_id", req.user!.userId));
  res.json({ moduleId });
});
