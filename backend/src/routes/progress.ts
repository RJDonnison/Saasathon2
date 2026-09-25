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

async function classroomModuleIds(
  classroomId: string,
  publishedOnly: boolean,
): Promise<string[]> {
  let query = supabase
    .from("modules")
    .select("id")
    .eq("classroom_id", classroomId);
  if (publishedOnly) query = query.eq("state", "published");
  const rows = unwrap(await query) as { id: string }[];
  return rows.map((row) => row.id);
}

progressRouter.get("/students/:id/progress", async (req, res) => {
  if (!(await permitted(req, req.params.id)))
    return res.status(404).json({ error: "Student not found" });
  const moduleIds = await classroomModuleIds(
    req.user!.classroomId,
    req.user!.role === "student",
  );
  const rows = moduleIds.length
    ? (unwrap(
        await supabase
          .from("module_progress")
          .select("*")
          .eq("student_id", req.params.id)
          .in("module_id", moduleIds),
      ) as ModuleProgressRow[])
    : [];
  res.json(rows.map(toModuleProgress));
});
progressRouter.get("/students/:id/section-progress", async (req, res) => {
  if (!(await permitted(req, req.params.id)))
    return res.status(404).json({ error: "Student not found" });
  const moduleIds = await classroomModuleIds(
    req.user!.classroomId,
    req.user!.role === "student",
  );
  const sectionIds = moduleIds.length
    ? (
        unwrap(
          await supabase
            .from("sections")
            .select("id")
            .in("module_id", moduleIds),
        ) as { id: string }[]
      ).map((section) => section.id)
    : [];
  const rows = sectionIds.length
    ? (unwrap(
        await supabase
          .from("section_progress")
          .select("*")
          .eq("student_id", req.params.id)
          .in("section_id", sectionIds),
      ) as SectionProgressRow[])
    : [];
  res.json(rows.map(toSectionProgress));
});
progressRouter.put("/progress", async (req, res) => {
  const b = (req.body ?? {}) as Partial<UpsertModuleProgressRequest>;
  const studentId = b.studentId ?? req.user!.userId;
  const module =
    typeof b.moduleId === "string"
      ? await moduleInClassroom(b.moduleId, req.user!.classroomId)
      : null;
  if (
    typeof b.moduleId !== "string" ||
    !statuses.includes(b.status as ProgressStatus) ||
    !(await permitted(req, studentId)) ||
    !module ||
    (req.user!.role === "student" && module.state !== "published")
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
  const module = section
    ? await moduleInClassroom(section.module_id, req.user!.classroomId)
    : null;
  if (
    !section ||
    !statuses.includes(b.status as ProgressStatus) ||
    !(await permitted(req, studentId)) ||
    !module ||
    (req.user!.role === "student" && module.state !== "published")
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
