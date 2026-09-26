import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { requireRole } from "../auth.js";
import { lessonOpen, liveModuleIds, membershipFor, studentInClassroom } from "../access.js";
import { supabase } from "../supabase.js";
import { disconnectClassroomMember } from "../sockets.js";
import {
  toAttempt,
  toClassroom,
  toComment,
  toInvitation,
  toModule,
  toModuleProgress,
  toSectionProgress,
  toSession,
  toSubmission,
  toStudentWork,
  toUser,
  unwrap,
  type AttemptRow,
  type ClassroomRow,
  type CodeSubmissionRow,
  type CommentRow,
  type InvitationRow,
  type MembershipRow,
  type ModuleProgressRow,
  type ModuleRow,
  type SectionProgressRow,
  type SessionRow,
  type StudentWorkRow,
  type UserRow,
} from "../rows.js";
import type {
  CreateClassroomRequest,
  CreateClassroomResponse,
  CreateClassroomInvitationsRequest,
  CreateClassroomInvitationsResponse,
  GetClassroomResponse,
  GetClassroomStudentsResponse,
  GetTeacherStudentAggregateResponse,
  ListClassroomInvitationsResponse,
  ListModulesResponse,
  ListMyClassroomsResponse,
  ListLessonSummariesResponse,
  ListAnnouncementsResponse,
  CreateAnnouncementRequest,
  ActivateClassroomResponse,
  Announcement,
  ExerciseSummary,
  ProgressStatus,
} from "../../../shared/types.js";

export const classroomsRouter = Router();
async function member(req: any, res: any): Promise<boolean> {
  // A token represents one selected membership; a teacher creating a classroom, or a student accepting an invitation, switches it.
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

/**
 * POST /api/classrooms — mounted in index.ts before requireMember, since a brand-new teacher has no classroom yet.
 * There are no join codes; the teacher invites students afterwards.
 */
export const createClassroom: RequestHandler = async (req, res) => {
  const { authId, name: userName, email } = req.identity!;
  const body = (req.body ?? {}) as Partial<CreateClassroomRequest>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) {
    return res.status(400).json({ error: "Give the classroom a name (up to 80 characters)" });
  }
  // Creating a classroom makes it the caller's active one and their role teacher, so students can't do it.
  const asStudent = unwrap(
    await supabase
      .from("memberships")
      .select("id")
      .eq("user_id", authId)
      .eq("role", "student")
      .limit(1),
  ) as { id: string }[];
  if (asStudent.length) {
    return res.status(403).json({ error: "Only teachers can create classrooms" });
  }

  const user = unwrap(
    await supabase
      .from("users")
      .upsert({ id: authId, name: userName, email }, { onConflict: "id" })
      .select("*")
      .single(),
  ) as UserRow;
  const classroom = unwrap(
    await supabase
      .from("classrooms")
      .insert({ id: randomUUID(), name })
      .select("*")
      .single(),
  ) as ClassroomRow;
  const membership = unwrap(
    await supabase
      .from("memberships")
      .insert({
        id: randomUUID(),
        user_id: authId,
        classroom_id: classroom.id,
        role: "teacher",
        created_at: new Date().toISOString(),
      })
      .select("*")
      .single(),
  ) as MembershipRow;
  const response: CreateClassroomResponse = {
    classroom: toClassroom(classroom, user.name),
    user: toUser(user, membership),
  };
  res.status(201).json(response);
};

/**
 * Teacher-managed invitations. An invitation is addressed to a Google email and enrols nobody: the student sees it
 * after signing in (`/api/invitations`) and chooses to accept or decline.
 */
classroomsRouter.get("/:id/invitations", requireRole("teacher"), async (req, res) => {
  if (!(await member(req, res))) return;
  const rows = unwrap(
    await supabase
      .from("classroom_invitations")
      .select("*")
      .eq("classroom_id", req.params.id)
      .order("created_at"),
  ) as InvitationRow[];
  const body: ListClassroomInvitationsResponse = rows.map(toInvitation);
  res.json(body);
});

classroomsRouter.post("/:id/invitations", requireRole("teacher"), async (req, res) => {
  if (!(await member(req, res))) return;
  const classroomId = String(req.params.id);
  const body = (req.body ?? {}) as Partial<CreateClassroomInvitationsRequest>;
  if (!Array.isArray(body.students) || body.students.length < 1 || body.students.length > 250) {
    return res.status(400).json({ error: "Invite between 1 and 250 students" });
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

  const invitations: InvitationRow[] = [];
  const skipped: string[] = [];
  for (const [email, studentName] of entries) {
    // Someone already in this classroom (student or teacher) has nothing to accept.
    const person = unwrap(
      await supabase.from("users").select("id").eq("email", email).maybeSingle(),
    ) as { id: string } | null;
    if (person && (await membershipFor(person.id, classroomId))) {
      skipped.push(email);
      continue;
    }
    const existing = unwrap(
      await supabase
        .from("classroom_invitations")
        .select("*")
        .eq("classroom_id", classroomId)
        .eq("email", email)
        .maybeSingle(),
    ) as InvitationRow | null;
    // A still-pending invitation keeps its place; a declined one is re-sent as a fresh invitation.
    const pending = existing?.status === "pending";
    const row = unwrap(
      await supabase
        .from("classroom_invitations")
        .upsert(
          {
            id: existing?.id ?? randomUUID(),
            classroom_id: classroomId,
            email,
            student_name: studentName ?? existing?.student_name ?? null,
            invited_by: req.user!.userId,
            status: "pending",
            user_id: null,
            created_at: pending ? existing.created_at : new Date().toISOString(),
            responded_at: null,
          },
          { onConflict: "classroom_id,email" },
        )
        .select("*")
        .single(),
    ) as InvitationRow;
    invitations.push(row);
  }
  const response: CreateClassroomInvitationsResponse = {
    invitations: invitations.map(toInvitation),
    skipped,
  };
  res.status(201).json(response);
});

/** Cancels a pending/declined invitation, or removes a student who accepted (their membership goes too). */
classroomsRouter.delete("/:id/invitations/:invitationId", requireRole("teacher"), async (req, res) => {
  if (!(await member(req, res))) return;
  const invitation = unwrap(
    await supabase
      .from("classroom_invitations")
      .select("id,status,user_id")
      .eq("id", req.params.invitationId)
      .eq("classroom_id", req.params.id)
      .maybeSingle(),
  ) as Pick<InvitationRow, "id" | "status" | "user_id"> | null;
  if (!invitation) return res.status(404).json({ error: "Invitation not found" });
  if (invitation.status === "accepted" && invitation.user_id) {
    unwrap(
      await supabase
        .from("memberships")
        .delete()
        .eq("user_id", invitation.user_id)
        .eq("classroom_id", req.params.id)
        .eq("role", "student"),
    );
    try {
      await disconnectClassroomMember(String(req.params.id), invitation.user_id);
    } catch (err) {
      console.error("[classrooms] could not disconnect removed student sockets", err);
    }
  }
  unwrap(
    await supabase
      .from("classroom_invitations")
      .delete()
      .eq("id", invitation.id),
  );
  res.status(204).end();
});
/** First teacher's name for each classroom id. */
async function teacherNames(classroomIds: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (!classroomIds.length) return names;
  const rows = unwrap(
    await supabase
      .from("memberships")
      .select("classroom_id,user_id")
      .in("classroom_id", classroomIds)
      .eq("role", "teacher")
      .order("created_at"),
  ) as Array<{ classroom_id: string; user_id: string }>;
  const users = rows.length
    ? (unwrap(
        await supabase.from("users").select("id,name").in("id", [...new Set(rows.map((r) => r.user_id))]),
      ) as Array<{ id: string; name: string }>)
    : [];
  for (const row of rows) {
    const name = users.find((u) => u.id === row.user_id)?.name;
    if (name && !names.has(row.classroom_id)) names.set(row.classroom_id, name);
  }
  return names;
}

/** Every classroom the caller belongs to, with their own progress through its lessons. */
classroomsRouter.get("/", async (req, res) => {
  const memberships = unwrap(
    await supabase.from("memberships").select("*").eq("user_id", req.user!.userId),
  ) as MembershipRow[];
  const ids = memberships.map((m) => m.classroom_id);
  if (!ids.length) return res.json([]);
  const [classrooms, modules, progress, teachers, sessions] = await Promise.all([
    supabase.from("classrooms").select("*").in("id", ids),
    supabase.from("modules").select("id,classroom_id").in("classroom_id", ids).eq("status", "published"),
    supabase.from("module_progress").select("module_id,status").eq("student_id", req.user!.userId),
    teacherNames(ids),
    supabase.from("lesson_sessions").select("*").in("classroom_id", ids).is("ended_at", null),
  ]);
  const classroomRows = unwrap(classrooms) as ClassroomRow[];
  const sessionRows = unwrap(sessions) as SessionRow[];
  const liveTitles = sessionRows.length
    ? (unwrap(
        await supabase.from("modules").select("id,title").in("id", sessionRows.map((r) => r.module_id)),
      ) as Array<{ id: string; title: string }>)
    : [];
  const moduleRows = unwrap(modules) as Array<{ id: string; classroom_id: string }>;
  const done = new Set(
    (unwrap(progress) as Array<{ module_id: string; status: string }>)
      .filter((p) => p.status === "completed")
      .map((p) => p.module_id),
  );
  const body: ListMyClassroomsResponse = memberships
    .map((m) => {
      const room = classroomRows.find((c) => c.id === m.classroom_id);
      if (!room) return null;
      const lessons = moduleRows.filter((mod) => mod.classroom_id === room.id);
      return {
        id: room.id,
        name: room.name,
        teacherName: teachers.get(room.id) ?? null,
        role: m.role,
        lessonCount: lessons.length,
        completedCount: lessons.filter((l) => done.has(l.id)).length,
        active: room.id === req.user!.classroomId,
        liveSession: (() => {
          const row = sessionRows.find((r) => r.classroom_id === room.id);
          return row ? toSession(row, liveTitles.find((t) => t.id === row.module_id)?.title ?? "Lesson") : null;
        })(),
        joinedAt: m.created_at,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => Number(b.active) - Number(a.active) || b.joinedAt.localeCompare(a.joinedAt))
    .map(({ joinedAt: _joinedAt, ...c }) => c);
  res.json(body);
});

/** Switch the active classroom. Like accepting an invitation, it just refreshes the membership timestamp. */
classroomsRouter.post("/:id/activate", async (req, res) => {
  const membership = await membershipFor(req.user!.userId, String(req.params.id));
  if (!membership) return res.status(404).json({ error: "Not a member of this classroom" });
  const updated = unwrap(
    await supabase
      .from("memberships")
      .update({ created_at: new Date().toISOString() })
      .eq("id", membership.id)
      .select("*")
      .single(),
  ) as MembershipRow;
  const user = unwrap(
    await supabase.from("users").select("*").eq("id", req.user!.userId).single(),
  ) as UserRow;
  const body: ActivateClassroomResponse = { user: toUser(user, updated) };
  res.json(body);
});

/** The caller's own view of every lesson: progress, what is in it, and how their code runs went. */
classroomsRouter.get("/:id/lessons", requireRole("student"), async (req, res) => {
  if (!(await member(req, res))) return;
  const studentId = req.user!.userId;
  const modules = unwrap(
    await supabase
      .from("modules")
      .select("*")
      .eq("classroom_id", req.params.id)
      .eq("status", "published")
      .order("position")
      .order("id"),
  ) as ModuleRow[];
  const moduleIds = modules.map((m) => m.id);
  const live = await liveModuleIds(String(req.params.id));
  const sections = moduleIds.length
    ? (unwrap(
        await supabase.from("sections").select("*").in("module_id", moduleIds).order("position").order("id"),
      ) as Array<{ id: string; module_id: string; title: string }>)
    : [];
  const sectionIds = sections.map((s) => s.id);
  const questions = sectionIds.length
    ? (unwrap(
        await supabase
          .from("questions")
          .select("id,section_id,prompt")
          .in("section_id", sectionIds)
          .eq("kind", "code")
          .order("position")
          .order("id"),
      ) as Array<{ id: string; section_id: string; prompt: string }>)
    : [];
  const exercises = questions.length
    ? (unwrap(
        await supabase.from("code_exercises").select("id,question_id").in("question_id", questions.map((q) => q.id)),
      ) as Array<{ id: string; question_id: string }>)
    : [];
  const [progress, submissions] = await Promise.all([
    supabase.from("module_progress").select("module_id,status").eq("student_id", studentId).in("module_id", moduleIds.length ? moduleIds : [""]),
    exercises.length
      ? supabase
          .from("code_submissions")
          .select("code_exercise_id,passed,created_at")
          .eq("student_id", studentId)
          .in("code_exercise_id", exercises.map((e) => e.id))
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ]);
  const statusOf = new Map(
    (unwrap(progress) as Array<{ module_id: string; status: ProgressStatus }>).map((p) => [p.module_id, p.status]),
  );
  const runs = unwrap(submissions as { data: Array<{ code_exercise_id: string; passed: boolean | null }>; error: null }) as Array<{
    code_exercise_id: string;
    passed: boolean | null;
  }>;

  const body: ListLessonSummariesResponse = modules.map((m) => {
    const mine = sections.filter((s) => s.module_id === m.id);
    const exerciseSummaries: ExerciseSummary[] = [];
    for (const section of mine) {
      for (const q of questions.filter((q) => q.section_id === section.id)) {
        const ex = exercises.find((e) => e.question_id === q.id);
        if (!ex) continue;
        const history = runs.filter((r) => r.code_exercise_id === ex.id); // newest first
        exerciseSummaries.push({
          id: ex.id,
          title: q.prompt,
          runs: history.length,
          lastRun: history.length ? (history[0].passed === false ? "error" : "ok") : null,
        });
      }
    }
    const available = lessonOpen(m, live);
    // A live-only lesson that is not being taught is only a title: no intro, contents or exercises.
    return {
      ...toModule(m),
      content: available ? m.content : "",
      status: statusOf.get(m.id) ?? "not_started",
      available,
      sections: available ? mine.map((s) => ({ id: s.id, title: s.title })) : [],
      exercises: available ? exerciseSummaries : [],
    };
  });
  res.json(body);
});

/** Teacher notes to the class. Everyone in the classroom can read them; only teachers post. */
classroomsRouter.get("/:id/announcements", async (req, res) => {
  if (!(await member(req, res))) return;
  const rows = unwrap(
    await supabase
      .from("classroom_announcements")
      .select("*")
      .eq("classroom_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ) as Array<{ id: string; classroom_id: string; author_id: string; text: string; created_at: string }>;
  const authors = rows.length
    ? (unwrap(
        await supabase.from("users").select("id,name").in("id", [...new Set(rows.map((r) => r.author_id))]),
      ) as Array<{ id: string; name: string }>)
    : [];
  const body: ListAnnouncementsResponse = rows.map((r) => ({
    id: r.id,
    classroomId: r.classroom_id,
    authorName: authors.find((a) => a.id === r.author_id)?.name ?? "Your teacher",
    text: r.text,
    createdAt: r.created_at,
  }));
  res.json(body);
});

classroomsRouter.post("/:id/announcements", requireRole("teacher"), async (req, res) => {
  if (!(await member(req, res))) return;
  const { text } = (req.body ?? {}) as Partial<CreateAnnouncementRequest>;
  const clean = typeof text === "string" ? text.trim() : "";
  if (!clean || clean.length > 1000) {
    return res.status(400).json({ error: "Write a note of up to 1000 characters" });
  }
  const row = unwrap(
    await supabase
      .from("classroom_announcements")
      .insert({ id: randomUUID(), classroom_id: req.params.id, author_id: req.user!.userId, text: clean })
      .select("*")
      .single(),
  ) as { id: string; classroom_id: string; text: string; created_at: string };
  const author = unwrap(
    await supabase.from("users").select("name").eq("id", req.user!.userId).single(),
  ) as { name: string };
  const body: Announcement = {
    id: row.id,
    classroomId: row.classroom_id,
    authorName: author.name,
    text: row.text,
    createdAt: row.created_at,
  };
  res.status(201).json(body);
});

classroomsRouter.delete("/:id/announcements/:announcementId", requireRole("teacher"), async (req, res) => {
  if (!(await member(req, res))) return;
  unwrap(
    await supabase
      .from("classroom_announcements")
      .delete()
      .eq("id", req.params.announcementId)
      .eq("classroom_id", req.params.id),
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
  const teacher = unwrap(
    await supabase
      .from("memberships")
      .select("user_id")
      .eq("classroom_id", row.id)
      .eq("role", "teacher")
      .order("created_at")
      .limit(1)
      .maybeSingle(),
  ) as { user_id: string } | null;
  const teacherRow = teacher
    ? (unwrap(
        await supabase.from("users").select("name").eq("id", teacher.user_id).maybeSingle(),
      ) as { name: string } | null)
    : null;
  const body: GetClassroomResponse = toClassroom(row, teacherRow?.name ?? null);
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
        .eq(
          req.user!.role === "student" ? "status" : "classroom_id",
          req.user!.role === "student" ? "published" : req.params.id,
        )
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
  let query = supabase.from("modules").select("*").eq("classroom_id", req.params.id);
  if (req.user!.role === "student") query = query.eq("status", "published");
  const rows = unwrap(await query.order("position").order("id")) as ModuleRow[];
  const live = req.user!.role === "student" ? await liveModuleIds(String(req.params.id)) : null;
  const body: ListModulesResponse = rows.map((row) =>
    live && !lessonOpen(row, live) ? { ...toModule(row), content: "" } : toModule(row),
  );
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
    const [moduleProgress, sectionProgress, attempts, submissions, work] =
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
        supabase.from("student_work").select("*").eq("student_id", studentId),
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
      work: (work as StudentWorkRow[]).map(toStudentWork),
    };
    res.json(body);
  },
);
