import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireRole } from "../auth.js";
import { membershipFor, studentInClassroom } from "../access.js";
import { supabase } from "../supabase.js";
import { disconnectClassroomMember } from "../sockets.js";
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
  CreateClassroomAssignmentsRequest,
  ClassroomAssignment,
  GetClassroomResponse,
  GetClassroomStudentsResponse,
  GetTeacherStudentAggregateResponse,
  ListModulesResponse,
} from "../../../shared/types.js";

type ClassroomAssignmentRow = {
  id: string;
  classroom_id: string;
  email: string;
  student_name: string | null;
  student_id: string | null;
  created_at: string;
};

function toClassroomAssignment(row: ClassroomAssignmentRow): ClassroomAssignment {
  return {
    id: row.id,
    classroomId: row.classroom_id,
    email: row.email,
    studentName: row.student_name,
    studentId: row.student_id,
    status: row.student_id ? "active" : "pending",
    createdAt: row.created_at,
  };
}

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

/** Teacher-managed email roster. Matching students are enrolled on their next /me request. */
classroomsRouter.get("/:id/assignments", requireRole("teacher"), async (req, res) => {
  if (!(await member(req, res))) return;
  const rows = unwrap(
    await supabase
      .from("classroom_assignments")
      .select("*")
      .eq("classroom_id", req.params.id)
      .order("created_at"),
  ) as ClassroomAssignmentRow[];
  res.json(rows.map(toClassroomAssignment));
});

classroomsRouter.post("/:id/assignments", requireRole("teacher"), async (req, res) => {
  if (!(await member(req, res))) return;
  const body = (req.body ?? {}) as Partial<CreateClassroomAssignmentsRequest>;
  if (!Array.isArray(body.students) || body.students.length < 1 || body.students.length > 250) {
    return res.status(400).json({ error: "Add between 1 and 250 students" });
  }
  const entries = new Map<string, string | null>();
  for (const item of body.students) {
    const email = typeof item?.email === "string" ? item.email.trim().toLowerCase() : "";
    const name = typeof item?.name === "string" ? item.name.trim().slice(0, 120) : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: `Invalid student email: ${email || "blank"}` });
    }
    entries.set(email, name || null);
  }

  const saved: ClassroomAssignmentRow[] = [];
  for (const [email, studentName] of entries) {
    const existing = unwrap(
      await supabase
        .from("classroom_assignments")
        .select("*")
        .eq("classroom_id", req.params.id)
        .eq("email", email)
        .maybeSingle(),
    ) as ClassroomAssignmentRow | null;
    const person = unwrap(
      await supabase.from("users").select("id").eq("email", email).maybeSingle(),
    ) as { id: string } | null;
    let studentId = existing?.student_id ?? null;
    if (person && (!studentId || studentId === person.id)) {
      const membership = unwrap(
        await supabase
          .from("memberships")
          .select("id,role")
          .eq("user_id", person.id)
          .eq("classroom_id", req.params.id)
          .maybeSingle(),
      ) as { id: string; role: "student" | "teacher" } | null;
      if (membership?.role !== "teacher") {
        unwrap(
          await supabase.from("memberships").upsert(
            {
              id: membership?.id ?? randomUUID(),
              user_id: person.id,
              classroom_id: String(req.params.id),
              role: "student",
              created_at: new Date().toISOString(),
            },
            { onConflict: "user_id,classroom_id" },
          ),
        );
        studentId = person.id;
      }
    }
    const row = unwrap(
      await supabase
        .from("classroom_assignments")
        .upsert(
          {
            id: existing?.id ?? randomUUID(),
            classroom_id: req.params.id,
            email,
            student_name: studentName ?? existing?.student_name ?? null,
            student_id: studentId,
            assigned_by: req.user!.userId,
            created_at: existing?.created_at ?? new Date().toISOString(),
          },
          { onConflict: "classroom_id,email" },
        )
        .select("*")
        .single(),
    ) as ClassroomAssignmentRow;
    saved.push(row);
  }
  res.status(201).json(saved.map(toClassroomAssignment));
});

classroomsRouter.delete("/:id/assignments/:assignmentId", requireRole("teacher"), async (req, res) => {
  if (!(await member(req, res))) return;
  const assignment = unwrap(
    await supabase
      .from("classroom_assignments")
      .select("id,student_id")
      .eq("id", req.params.assignmentId)
      .eq("classroom_id", req.params.id)
      .maybeSingle(),
  ) as { id: string; student_id: string | null } | null;
  if (!assignment) return res.status(404).json({ error: "Student assignment not found" });
  if (assignment.student_id) {
    unwrap(
      await supabase
        .from("memberships")
        .delete()
        .eq("user_id", assignment.student_id)
        .eq("classroom_id", req.params.id)
        .eq("role", "student"),
    );
    try {
      await disconnectClassroomMember(String(req.params.id), assignment.student_id);
    } catch (err) {
      console.error("[classrooms] could not disconnect removed student sockets", err);
    }
  }
  unwrap(
    await supabase
      .from("classroom_assignments")
      .delete()
      .eq("id", assignment.id),
  );
  res.status(204).end();
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
  const rows = unwrap(
    await supabase
      .from("modules")
      .select("*")
      .eq("classroom_id", req.params.id)
      .order("position")
      .order("id"),
  ) as ModuleRow[];
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
    const [moduleProgress, sectionProgress, attempts, submissions] =
      await Promise.all([
        supabase
          .from("module_progress")
          .select("*")
          .eq("student_id", studentId),
        supabase
          .from("section_progress")
          .select("*")
          .eq("student_id", studentId),
        supabase
          .from("attempts")
          .select("*")
          .eq("student_id", studentId)
          .order("created_at"),
        supabase
          .from("code_submissions")
          .select("*")
          .eq("student_id", studentId)
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
