import { Router } from "express";
import {
  isStudentOwner,
  moduleForUser,
  studentInClassroom,
  visibleModuleIds,
} from "../access.js";
import { supabase } from "../supabase.js";
import { emitModuleProgressUpdate } from "../sockets.js";
import {
  toModuleProgress,
  toSectionProgress,
  unwrap,
  type ModuleProgressRow,
  type SectionProgressRow,
  type SectionRow,
} from "../rows.js";
import type {
  ProgressStatus,
  ModuleProgress,
  SectionProgress,
  UpsertModuleProgressRequest,
  UpsertSectionProgressRequest,
} from "../../../shared/types.js";
const statuses: ProgressStatus[] = ["not_started", "in_progress"];
export const progressRouter = Router();
async function permitted(req: any, studentId: string) {
  return (
    isStudentOwner(req.user!, studentId) ||
    (req.user!.role === "teacher" &&
      !!(await studentInClassroom(studentId, req.user!.classroomId)))
  );
}

progressRouter.get("/students/:id/progress", async (req, res) => {
  if (!(await permitted(req, req.params.id)))
    return res.status(404).json({ error: "Student not found" });
  const [rows, visible] = await Promise.all([
    supabase.from("module_progress").select("*").eq("student_id", req.params.id),
    visibleModuleIds(req.user!.classroomId, req.user!.role),
  ]);
  const body: ModuleProgress[] = (unwrap(rows) as ModuleProgressRow[])
    .filter((row) => visible.has(row.module_id))
    .map(toModuleProgress);
  res.json(body);
});
progressRouter.get("/students/:id/section-progress", async (req, res) => {
  if (!(await permitted(req, req.params.id)))
    return res.status(404).json({ error: "Student not found" });
  // The section's module comes along in the same query, so nothing is looked up per row.
  const [rows, visible] = await Promise.all([
    supabase
      .from("section_progress")
      .select("*, sections(module_id)")
      .eq("student_id", req.params.id),
    visibleModuleIds(req.user!.classroomId, req.user!.role),
  ]);
  const body: SectionProgress[] = (
    unwrap(rows) as Array<SectionProgressRow & { sections: { module_id: string } | null }>
  )
    .filter((row) => row.sections && visible.has(row.sections.module_id))
    .map(toSectionProgress);
  res.json(body);
});
progressRouter.put("/progress", async (req, res) => {
  const b = (req.body ?? {}) as Partial<UpsertModuleProgressRequest>;
  const studentId = b.studentId ?? req.user!.userId;
  const valid =
    typeof b.moduleId === "string" && statuses.includes(b.status as ProgressStatus);
  // The two checks are independent, so they run together.
  const [allowed, module] = valid
    ? await Promise.all([
        permitted(req, studentId),
        moduleForUser(b.moduleId!, req.user!.classroomId, req.user!.role),
      ])
    : [false, null];
  if (!allowed || !module)
    return res.status(400).json({ error: "Invalid module progress request" });
  // The write and the live-session lookup (for the socket payload) don't depend on each other.
  const [saved, live] = await Promise.all([
    supabase
      .from("module_progress")
      .upsert(
        {
          id: `${studentId}:${b.moduleId}`,
          student_id: studentId,
          module_id: b.moduleId,
          status: b.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,module_id" },
      )
      .select("*")
      .single(),
    supabase
      .from("lesson_sessions")
      .select("id,module_id")
      .eq("classroom_id", req.user!.classroomId)
      .is("ended_at", null)
      .maybeSingle(),
  ]);
  const progress = toModuleProgress(unwrap(saved) as ModuleProgressRow);
  const liveSession = unwrap(live) as { id: string; module_id: string } | null;
  emitModuleProgressUpdate({
    type: "module_progress_update",
    classroomId: req.user!.classroomId,
    moduleId: progress.moduleId,
    sessionId:
      liveSession?.module_id === progress.moduleId ? liveSession.id : null,
    progress,
  });
  res.json(progress);
});
progressRouter.put("/section-progress", async (req, res) => {
  const b = (req.body ?? {}) as Partial<UpsertSectionProgressRequest>;
  const studentId = b.studentId ?? req.user!.userId;
  const section =
    typeof b.sectionId === "string"
      ? (unwrap(
          await supabase
            .from("sections")
            .select("*")
            .eq("id", b.sectionId)
            .maybeSingle(),
        ) as SectionRow | null)
      : null;
  if (
    !section ||
    !statuses.includes(b.status as ProgressStatus) ||
    !(await permitted(req, studentId)) ||
    !(await moduleForUser(
      section.module_id,
      req.user!.classroomId,
      req.user!.role,
    ))
  )
    return res.status(400).json({ error: "Invalid section progress request" });
  const row = unwrap(
    await supabase
      .from("section_progress")
      .upsert(
        {
          id: `${studentId}:${section.id}`,
          student_id: studentId,
          section_id: section.id,
          status: b.status,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,section_id" },
      )
      .select("*")
      .single(),
  ) as SectionProgressRow;
  res.json(toSectionProgress(row));
});
