import { randomUUID } from "node:crypto";
import { Router, type RequestHandler } from "express";
import { invalidateProfile, requireRole } from "../auth.js";
import { lessonOpen, liveModuleIds, studentInClassroom } from "../access.js";
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
/**
 * req.user is built from the caller's active membership (see findProfile), so :id matching its classroom already
 * proves they belong to it — no membership lookup needed. Stays async so callers keep `await member(...)`.
 */
async function member(req: any, res: any): Promise<boolean> {
  if (req.params.id !== req.user!.classroomId) {
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
  // The student check and the user upsert don't depend on each other.
  const [studentCheck, userResult] = await Promise.all([
    supabase.from("memberships").select("id").eq("user_id", authId).eq("role", "student").limit(1),
    supabase.from("users").upsert({ id: authId, name: userName, email }, { onConflict: "id" }).select("*").single(),
  ]);
  if ((unwrap(studentCheck) as { id: string }[]).length) {
    return res.status(403).json({ error: "Only teachers can create classrooms" });
  }
  const user = unwrap(userResult) as UserRow;
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
  invalidateProfile(authId);
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

  // Everything the loop needs is fetched up front in a fixed number of queries (chunked to keep URLs short),
  // and the invitations are written with one bulk upsert — not four round trips per email.
  const emails = [...entries.keys()];
  const groups = Array.from({ length: Math.ceil(emails.length / 100) }, (_, i) => emails.slice(i * 100, i * 100 + 100));
  const found = await Promise.all(
    groups.map((group) =>
      Promise.all([
        supabase.from("users").select("id,email").in("email", group),
        supabase.from("classroom_invitations").select("*").eq("classroom_id", classroomId).in("email", group),
      ]),
    ),
  );
  const people = found.flatMap(([users]) => unwrap(users) as Array<{ id: string; email: string }>);
  const existingByEmail = new Map(
    found.flatMap(([, invitations]) => unwrap(invitations) as InvitationRow[]).map((row) => [row.email, row]),
  );
  const memberIds = new Set<string>();
  if (people.length) {
    const idGroups = Array.from({ length: Math.ceil(people.length / 100) }, (_, i) => people.slice(i * 100, i * 100 + 100));
    const memberships = await Promise.all(
      idGroups.map((group) =>
        supabase
          .from("memberships")
          .select("user_id")
          .eq("classroom_id", classroomId)
          .in("user_id", group.map((person) => person.id)),
      ),
    );
    for (const result of memberships) for (const row of unwrap(result) as Array<{ user_id: string }>) memberIds.add(row.user_id);
  }
  const memberEmails = new Set(people.filter((person) => memberIds.has(person.id)).map((person) => person.email));

  const skipped: string[] = [];
  const outgoing: Array<Record<string, unknown>> = [];
  for (const [email, studentName] of entries) {
    // Someone already in this classroom (student or teacher) has nothing to accept.
    if (memberEmails.has(email)) {
      skipped.push(email);
      continue;
    }
    const existing = existingByEmail.get(email);
    // A still-pending invitation keeps its place; a declined one is re-sent as a fresh invitation.
    const pending = existing?.status === "pending";
    outgoing.push({
      id: existing?.id ?? randomUUID(),
      classroom_id: classroomId,
      email,
      student_name: studentName ?? existing?.student_name ?? null,
      invited_by: req.user!.userId,
      status: "pending",
      user_id: null,
      created_at: existing && pending ? existing.created_at : new Date().toISOString(),
      responded_at: null,
    });
  }
  const saved = outgoing.length
    ? (unwrap(
        await supabase
          .from("classroom_invitations")
          .upsert(outgoing, { onConflict: "classroom_id,email" })
          .select("*"),
      ) as InvitationRow[])
    : [];
  const savedByEmail = new Map(saved.map((row) => [row.email, row]));
  const invitations = outgoing
    .map((row) => savedByEmail.get(String(row.email)))
    .filter((row): row is InvitationRow => row !== undefined);
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
    invalidateProfile(invitation.user_id);
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
const oneOf = <T>(value: T | T[] | null | undefined): T | undefined =>
  Array.isArray(value) ? value[0] : (value ?? undefined);
const byPositionThenId = <T extends { position: number; id: string }>(a: T, b: T) =>
  a.position - b.position || a.id.localeCompare(b.id);

/** Every classroom the caller belongs to, with their own progress through its lessons. Two waves of parallel queries. */
classroomsRouter.get("/", async (req, res) => {
  const userId = req.user!.userId;
  // Wave 1: memberships (with each classroom embedded) and the caller's completed lessons don't depend on each other.
  const [membershipsResult, progressResult] = await Promise.all([
    supabase.from("memberships").select("*, classrooms(*)").eq("user_id", userId),
    supabase.from("module_progress").select("module_id").eq("student_id", userId).eq("status", "completed"),
  ]);
  const memberships = (
    unwrap(membershipsResult) as Array<MembershipRow & { classrooms: ClassroomRow | null }>
  ).filter((m) => m.classrooms);
  const ids = memberships.map((m) => m.classroom_id);
  if (!ids.length) return res.json([]);
  // Wave 2: everything keyed by those classroom ids, with names/titles joined in rather than looked up after.
  const [modulesResult, teachersResult, sessionsResult] = await Promise.all([
    supabase.from("modules").select("id,classroom_id").in("classroom_id", ids).eq("status", "published"),
    supabase
      .from("memberships")
      .select("classroom_id, users(name)")
      .in("classroom_id", ids)
      .eq("role", "teacher")
      .order("created_at"),
    supabase.from("lesson_sessions").select("*, modules(title)").in("classroom_id", ids).is("ended_at", null),
  ]);
  const moduleRows = unwrap(modulesResult) as Array<{ id: string; classroom_id: string }>;
  const sessionRows = unwrap(sessionsResult) as Array<SessionRow & { modules: { title: string } | null }>;
  const teachers = new Map<string, string>();
  for (const row of unwrap(teachersResult) as unknown as Array<{ classroom_id: string; users: { name: string } | null }>) {
    const name = oneOf(row.users)?.name;
    if (name && !teachers.has(row.classroom_id)) teachers.set(row.classroom_id, name);
  }
  const done = new Set((unwrap(progressResult) as Array<{ module_id: string }>).map((p) => p.module_id));
  const body: ListMyClassroomsResponse = memberships
    .map((m) => {
      const room = m.classrooms!;
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
          if (!row) return null;
          const { modules, ...session } = row;
          return toSession(session, modules?.title ?? "Lesson");
        })(),
        joinedAt: m.created_at,
      };
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.joinedAt.localeCompare(a.joinedAt))
    .map(({ joinedAt: _joinedAt, ...c }) => c);
  res.json(body);
});

/** Switch the active classroom. Like accepting an invitation, it just refreshes the membership timestamp. */
classroomsRouter.post("/:id/activate", async (req, res) => {
  // One statement finds the membership, refreshes it and returns it with the user.
  const row = unwrap(
    await supabase
      .from("memberships")
      .update({ created_at: new Date().toISOString() })
      .eq("user_id", req.user!.userId)
      .eq("classroom_id", String(req.params.id))
      .select("*, users!inner(*)")
      .maybeSingle(),
  ) as (MembershipRow & { users: UserRow }) | null;
  if (!row) return res.status(404).json({ error: "Not a member of this classroom" });
  invalidateProfile(req.user!.userId);
  const { users: user, ...membership } = row;
  const body: ActivateClassroomResponse = { user: toUser(user, membership) };
  res.json(body);
});

// A student's lesson list: the lesson tree, their progress and their activity all load in ONE wave of parallel
// queries. The activity queries join up to the classroom (inner joins) instead of waiting for the tree's ids.
const CLASSROOM_OF_QUESTION = "questions!inner(sections!inner(modules!inner(classroom_id)))";
const CLASSROOM_OF_EXERCISE = `code_exercises!inner(${CLASSROOM_OF_QUESTION})`;
const PATH_TO_CLASSROOM = "questions.sections.modules.classroom_id";

type LessonTreeQuestion = { id: string; prompt: string; kind: string; position: number; code_exercises: { id: string } | Array<{ id: string }> | null };
type LessonTreeSection = { id: string; title: string; position: number; questions: LessonTreeQuestion[] | null };
type LessonTreeModule = ModuleRow & { sections: LessonTreeSection[] | null };

/** The caller's own view of every lesson: progress, what is in it, and how their code runs went. */
classroomsRouter.get("/:id/lessons", requireRole("student"), async (req, res) => {
  if (!(await member(req, res))) return;
  const studentId = req.user!.userId;
  const classroomId = String(req.params.id);
  const [modulesResult, live, progress, submissions, attempts, work] = await Promise.all([
    supabase
      .from("modules")
      .select("*, sections(id,title,position, questions(id,prompt,kind,position, code_exercises(id)))")
      .eq("classroom_id", classroomId)
      .eq("status", "published")
      .order("position")
      .order("id"),
    liveModuleIds(classroomId),
    supabase.from("module_progress").select("module_id,status").eq("student_id", studentId),
    supabase
      .from("code_submissions")
      .select(`code_exercise_id,passed,created_at, ${CLASSROOM_OF_EXERCISE}`)
      .eq("student_id", studentId)
      .eq(`code_exercises.${PATH_TO_CLASSROOM}`, classroomId)
      .order("created_at", { ascending: false }),
    supabase
      .from("attempts")
      .select(`question_id, ${CLASSROOM_OF_QUESTION}`)
      .eq("student_id", studentId)
      .eq(PATH_TO_CLASSROOM, classroomId),
    supabase
      .from("student_work")
      .select(`question_id, ${CLASSROOM_OF_QUESTION}`)
      .eq("student_id", studentId)
      .eq(PATH_TO_CLASSROOM, classroomId),
  ]);
  const modules = unwrap(modulesResult) as unknown as LessonTreeModule[];
  const statusOf = new Map(
    (unwrap(progress) as Array<{ module_id: string; status: ProgressStatus }>).map((p) => [p.module_id, p.status]),
  );
  const runs = unwrap(submissions) as unknown as Array<{ code_exercise_id: string; passed: boolean | null }>; // newest first
  const runsByExercise = new Map<string, Array<{ passed: boolean | null }>>();
  for (const run of runs) {
    const list = runsByExercise.get(run.code_exercise_id) ?? [];
    list.push(run);
    runsByExercise.set(run.code_exercise_id, list);
  }
  const startedQuestionIds = new Set([
    ...(unwrap(attempts) as unknown as Array<{ question_id: string }>).map((attempt) => attempt.question_id),
    ...(unwrap(work) as unknown as Array<{ question_id: string }>).map((entry) => entry.question_id),
  ]);

  const body: ListLessonSummariesResponse = modules.map((m) => {
    const { sections: tree, ...moduleRow } = m;
    const mine = [...(tree ?? [])].sort(byPositionThenId);
    const questions = mine.flatMap((section) => [...(section.questions ?? [])].sort(byPositionThenId));
    const exerciseSummaries: ExerciseSummary[] = [];
    for (const q of questions) {
      const ex = oneOf(q.code_exercises);
      if (!ex) continue;
      const history = runsByExercise.get(ex.id) ?? [];
      if (history.length) startedQuestionIds.add(q.id); // running the code counts as starting the question
      exerciseSummaries.push({
        id: ex.id,
        title: q.prompt,
        runs: history.length,
        lastRun: history.length ? (history[0].passed === false ? "error" : "ok") : null,
      });
    }
    const available = lessonOpen(m, live);
    // A live-only lesson that is not being taught is only a title: no intro, contents or exercises.
    return {
      ...toModule(moduleRow),
      content: available ? m.content : "",
      status: statusOf.get(m.id) ?? "not_started",
      available,
      sections: available ? mine.map((s) => ({ id: s.id, title: s.title })) : [],
      exercises: available ? exerciseSummaries : [],
      questionCount: available ? questions.length : 0,
      startedQuestionCount: available ? questions.filter((q) => startedQuestionIds.has(q.id)).length : 0,
    };
  });
  res.json(body);
});

/** Teacher notes to the class. Everyone in the classroom can read them; only teachers post. */
classroomsRouter.get("/:id/announcements", async (req, res) => {
  if (!(await member(req, res))) return;
  // The author's name is joined in, so there is no second lookup.
  const rows = unwrap(
    await supabase
      .from("classroom_announcements")
      .select("*, users(name)")
      .eq("classroom_id", req.params.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ) as unknown as Array<{
    id: string;
    classroom_id: string;
    text: string;
    created_at: string;
    users: { name: string } | null;
  }>;
  const body: ListAnnouncementsResponse = rows.map((r) => ({
    id: r.id,
    classroomId: r.classroom_id,
    authorName: oneOf(r.users)?.name ?? "Your teacher",
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
      .select("*, users(name)")
      .single(),
  ) as unknown as { id: string; classroom_id: string; text: string; created_at: string; users: { name: string } | null };
  const body: Announcement = {
    id: row.id,
    classroomId: row.classroom_id,
    authorName: oneOf(row.users)?.name ?? "Your teacher",
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
  // The classroom and its first teacher's name in one query (embedded, filtered and ordered).
  const row = unwrap(
    await supabase
      .from("classrooms")
      .select("*, memberships(created_at, users(name))")
      .eq("id", req.params.id)
      .eq("memberships.role", "teacher")
      .order("created_at", { referencedTable: "memberships" })
      .limit(1, { referencedTable: "memberships" })
      .maybeSingle(),
  ) as unknown as (ClassroomRow & { memberships: Array<{ users: { name: string } | null }> | null }) | null;
  if (!row) return res.status(404).json({ error: "Classroom not found" });
  const teacherName = oneOf(row.memberships?.[0]?.users)?.name ?? null;
  const body: GetClassroomResponse = toClassroom(row, teacherName);
  res.json(body);
});
classroomsRouter.get(
  "/:id/students",
  requireRole("teacher"),
  async (req, res) => {
    if (!(await member(req, res))) return;
    const rows = unwrap(
      await supabase
        .from("memberships")
        .select("*, users!inner(*)")
        .eq("classroom_id", req.params.id)
        .eq("role", "student"),
    ) as unknown as Array<MembershipRow & { users: UserRow }>;
    const body: GetClassroomStudentsResponse = rows
      .map(({ users: user, ...membership }) => toUser(user, membership))
      .sort((a, b) => a.name.localeCompare(b.name));
    res.json(body);
  },
);
classroomsRouter.get("/:id/modules", async (req, res) => {
  if (!(await member(req, res))) return;
  let query = supabase.from("modules").select("*").eq("classroom_id", req.params.id);
  if (req.user!.role === "student") query = query.eq("status", "published");
  // The live-session lookup doesn't depend on the module rows, so both go out together.
  const [rows, live] = await Promise.all([
    query.order("position").order("id").then((result) => unwrap(result) as ModuleRow[]),
    req.user!.role === "student" ? liveModuleIds(String(req.params.id)) : Promise.resolve(null),
  ]);
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
    if (!(await member(req, res))) return;
    const studentId = String(req.params.studentId);
    // The student check and every read are independent, so they run together; comments come embedded
    // under their submissions rather than in a follow-up query.
    const [student, ...results] = await Promise.all([
      studentInClassroom(studentId, String(req.params.id)),
      supabase.from("module_progress").select("*").eq("student_id", studentId),
      supabase.from("section_progress").select("*").eq("student_id", studentId),
      supabase.from("attempts").select("*").eq("student_id", studentId).order("created_at"),
      supabase.from("code_submissions").select("*, comments(*)").eq("student_id", studentId).order("created_at"),
      supabase.from("student_work").select("*").eq("student_id", studentId),
    ]);
    if (!student) return res.status(404).json({ error: "Student not found" });
    const [moduleProgress, sectionProgress, attempts, submissionsWithComments, work] = results.map(unwrap);
    const submissions = (submissionsWithComments as Array<CodeSubmissionRow & { comments: CommentRow[] | null }>).map(
      ({ comments: _comments, ...submission }) => submission,
    );
    const comments = (submissionsWithComments as Array<{ comments: CommentRow[] | null }>)
      .flatMap((submission) => submission.comments ?? [])
      .sort((a, b) => a.created_at.localeCompare(b.created_at));
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
