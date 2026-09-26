import { randomUUID } from "node:crypto";
import { Router } from "express";
import {
  isStudentOwner,
  moduleForUser,
  studentInClassroom,
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
  const visible = await Promise.all(
    rows.map(async (row) =>
      (await moduleForUser(
        row.module_id,
        req.user!.classroomId,
        req.user!.role,
      ))
        ? toModuleProgress(row)
        : null,
    ),
  );
  res.json(visible.filter((row): row is ModuleProgress => row !== null));
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
  const visible = await Promise.all(
    rows.map(async (row) => {
      const section = unwrap(
        await supabase
          .from("sections")
          .select("module_id")
          .eq("id", row.section_id)
          .maybeSingle(),
      ) as { module_id: string } | null;
      return section &&
        (await moduleForUser(
          section.module_id,
          req.user!.classroomId,
          req.user!.role,
        ))
        ? toSectionProgress(row)
        : null;
    }),
  );
  res.json(visible.filter((row): row is SectionProgress => row !== null));
});
progressRouter.put("/progress", async (req, res) => {
  const b = (req.body ?? {}) as Partial<UpsertModuleProgressRequest>;
  const studentId = b.studentId ?? req.user!.userId;
  if (
    typeof b.moduleId !== "string" ||
    !statuses.includes(b.status as ProgressStatus) ||
    !(await permitted(req, studentId)) ||
    !(await moduleForUser(b.moduleId, req.user!.classroomId, req.user!.role))
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
  const progress = toModuleProgress(row);
  const liveSession = unwrap(
    await supabase
      .from("lesson_sessions")
      .select("id,module_id")
      .eq("classroom_id", req.user!.classroomId)
      .is("ended_at", null)
      .maybeSingle(),
  ) as { id: string; module_id: string } | null;
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
