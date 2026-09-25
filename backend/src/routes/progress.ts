import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  isStudentOwner,
  moduleInClassroom,
  studentInClassroom,
} from "../access.js";
import { supabase } from "../supabase.js";
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
  UpsertModuleProgressRequest,
  UpsertSectionProgressRequest,
} from "../../../shared/types.js";
const statuses: ProgressStatus[] = ["not_started", "in_progress", "completed"];
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
  const rows = unwrap(
    await supabase
      .from("module_progress")
      .select("*")
      .eq("student_id", req.params.id),
  ) as ModuleProgressRow[];
  res.json(rows.map(toModuleProgress));
});
progressRouter.get("/students/:id/section-progress", async (req, res) => {
  if (!(await permitted(req, req.params.id)))
    return res.status(404).json({ error: "Student not found" });
  const rows = unwrap(
    await supabase
      .from("section_progress")
      .select("*")
      .eq("student_id", req.params.id),
  ) as SectionProgressRow[];
  res.json(rows.map(toSectionProgress));
});
progressRouter.put("/progress", async (req, res) => {
  const b = (req.body ?? {}) as Partial<UpsertModuleProgressRequest>;
  const studentId = b.studentId ?? req.user!.userId;
  if (
    typeof b.moduleId !== "string" ||
    !statuses.includes(b.status as ProgressStatus) ||
    !(await permitted(req, studentId)) ||
    !(await moduleInClassroom(b.moduleId, req.user!.classroomId))
  )
    return res.status(400).json({ error: "Invalid module progress request" });
  const row = unwrap(
    await supabase
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
  ) as ModuleProgressRow;
  res.json(toModuleProgress(row));
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
    !(await moduleInClassroom(section.module_id, req.user!.classroomId))
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
