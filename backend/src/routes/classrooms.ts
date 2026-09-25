import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireRole } from "../auth.js";
import { membershipFor, studentInClassroom } from "../access.js";
import { supabase } from "../supabase.js";
import {
  toAttempt,
  toClassroom,
  toComment,
  toModule,
  toModuleProgress,
  toSectionProgress,
  toSubmission,
  toUser,
  unwrap,
  type AttemptRow,
  type ClassroomRow,
  type CodeSubmissionRow,
  type CommentRow,
  type MembershipRow,
  type ModuleProgressRow,
  type ModuleRow,
  type SectionProgressRow,
  type UserRow,
} from "../rows.js";
import type {
  CreateClassroomRequest,
  GetClassroomResponse,
  GetClassroomStudentsResponse,
  GetTeacherStudentAggregateResponse,
  ListModulesResponse,
} from "../../../shared/types.js";

export const classroomsRouter = Router();
async function member(req: any, res: any): Promise<boolean> {
  // A token represents one selected membership; join again with another room code to switch.
  if (req.params.id !== req.user!.classroomId) {
    res.status(403).json({ error: "Not a member of this classroom" });
    return false;
  }
  const membership = await membershipFor(req.user!.userId, req.params.id);
  if (!membership) {
    res.status(403).json({ error: "Not a member of this classroom" });
    return false;
  }
  return true;
}

classroomsRouter.post("/", requireRole("teacher"), async (req, res) => {
  const body = (req.body ?? {}) as Partial<CreateClassroomRequest>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const roomCode =
    typeof body.roomCode === "string" ? body.roomCode.trim().toUpperCase() : "";
  if (!name || !roomCode)
    return res.status(400).json({ error: "name and roomCode are required" });
  const classroom = unwrap(
    await supabase
      .from("classrooms")
      .insert({ id: randomUUID(), name, room_code: roomCode })
      .select("*")
      .single(),
  ) as ClassroomRow;
  unwrap(
    await supabase.from("memberships").insert({
      id: randomUUID(),
      user_id: req.user!.userId,
      classroom_id: classroom.id,
      role: "teacher",
    }),
  );
  res.status(201).json(toClassroom(classroom));
});
classroomsRouter.get("/:id", async (req, res) => {
  if (!(await member(req, res))) return;
  const row = unwrap(
    await supabase
      .from("classrooms")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle(),
  ) as ClassroomRow | null;
  if (!row) return res.status(404).json({ error: "Classroom not found" });
  const body: GetClassroomResponse = toClassroom(row);
  res.json(body);
});
classroomsRouter.get(
  "/:id/students",
  requireRole("teacher"),
  async (req, res) => {
    if (!(await member(req, res))) return;
    const memberships = unwrap(
      await supabase
        .from("memberships")
        .select("*")
        .eq("classroom_id", req.params.id)
        .eq("role", "student"),
    ) as MembershipRow[];
    const ids = memberships.map((m) => m.user_id);
    const users = ids.length
      ? (unwrap(
          await supabase.from("users").select("*").in("id", ids).order("name"),
        ) as UserRow[])
      : [];
    const body: GetClassroomStudentsResponse = users.map((u) =>
      toUser(
        u,
        memberships.find((m) => m.user_id === u.id)!,
      ),
    );
    res.json(body);
  },
);
classroomsRouter.get("/:id/modules", async (req, res) => {
  if (!(await member(req, res))) return;
  const query = supabase
    .from("modules")
    .select("*")
    .eq("classroom_id", req.params.id);
  const rows = unwrap(await query.order("position").order("id")) as ModuleRow[];
  const body: ListModulesResponse = rows.map(toModule);
  res.json(body);
});
/** Teacher-only student aggregate, scoped to both the classroom and the requested student. */
classroomsRouter.get(
  "/:id/students/:studentId/aggregate",
  requireRole("teacher"),
  async (req, res) => {
    if (
      !(await member(req, res)) ||
      !(await studentInClassroom(
        String(req.params.studentId),
        String(req.params.id),
      ))
    )
      return res.status(404).json({ error: "Student not found" });
    const studentId = String(req.params.studentId);
    // Resolve every descendant from this classroom first. A global user may belong to several classrooms.
    const modules = unwrap(
      await supabase
        .from("modules")
        .select("id")
        .eq("classroom_id", req.params.id),
    ) as { id: string }[];
    const moduleIds = modules.map((m) => m.id);
    const sections = moduleIds.length
      ? (unwrap(
          await supabase
            .from("sections")
            .select("id")
            .in("module_id", moduleIds),
        ) as { id: string }[])
      : [];
    const sectionIds = sections.map((s) => s.id);
    const questions = sectionIds.length
      ? (unwrap(
          await supabase
            .from("questions")
            .select("id")
            .in("section_id", sectionIds),
        ) as { id: string }[])
      : [];
    const questionIds = questions.map((q) => q.id);
    const exercises = questionIds.length
      ? (unwrap(
          await supabase
            .from("code_exercises")
            .select("id")
            .in("question_id", questionIds),
        ) as { id: string }[])
      : [];
    const exerciseIds = exercises.map((e) => e.id);
    const [moduleProgress, sectionProgress, attempts, submissions] =
      await Promise.all([
        supabase
          .from("module_progress")
          .select("*")
          .eq("student_id", studentId)
          .in("module_id", moduleIds),
        supabase
          .from("section_progress")
          .select("*")
          .eq("student_id", studentId)
          .in("section_id", sectionIds),
        supabase
          .from("attempts")
          .select("*")
          .eq("student_id", studentId)
          .in("question_id", questionIds)
          .order("created_at"),
        supabase
          .from("code_submissions")
          .select("*")
          .eq("student_id", studentId)
          .in("code_exercise_id", exerciseIds)
          .order("created_at"),
      ]).then((results) => results.map(unwrap));
    const submissionIds = (submissions as { id: string }[]).map((s) => s.id);
    const comments = submissionIds.length
      ? unwrap(
          await supabase
            .from("comments")
            .select("*")
            .in("submission_id", submissionIds)
            .order("created_at"),
        )
      : [];
    const body: GetTeacherStudentAggregateResponse = {
      studentId,
      moduleProgress: (moduleProgress as ModuleProgressRow[]).map(
        toModuleProgress,
      ),
      sectionProgress: (sectionProgress as SectionProgressRow[]).map(
        toSectionProgress,
      ),
      attempts: (attempts as AttemptRow[]).map(toAttempt),
      submissions: (submissions as CodeSubmissionRow[]).map(toSubmission),
      comments: (comments as CommentRow[]).map(toComment),
    };
    res.json(body);
  },
);
