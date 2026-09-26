import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireRole } from "../auth.js";
import { moduleInClassroom } from "../access.js";
import { supabase } from "../supabase.js";
import { emitStudentActivityUpdate } from "../sockets.js";
import {
  toStudentActivity,
  toStudentWork,
  unwrap,
  type StudentActivityRow,
  type StudentWorkRow,
} from "../rows.js";
import type {
  GetClassroomStudentActivityResponse,
  GetStudentWorkResponse,
  RecordStudentActivityRequest,
  SaveStudentWorkRequest,
  StudentActivity,
  StudentActivitySnapshot,
  StudentActivityType,
} from "../../../shared/types.js";

export const activityRouter = Router();

const activityTypes: StudentActivityType[] = [
  "viewing_lesson",
  "answering_question",
  "checking_answer",
  "writing_code",
  "running_code",
  "checking_code",
];

type Location = { moduleId: string; sectionId: string | null; questionId: string | null };
type StateRow = Omit<StudentActivityRow, "id" | "created_at"> & { updated_at: string };

function fromState(row: StateRow): StudentActivity {
  return {
    id: `active:${row.student_id}`,
    studentId: row.student_id,
    classroomId: row.classroom_id,
    moduleId: row.module_id,
    sectionId: row.section_id,
    questionId: row.question_id,
    type: row.type,
    createdAt: new Date(row.updated_at).toISOString(),
  };
}

/** Resolve every client supplied location through the lesson hierarchy before saving it. */
async function validLocation(
  classroomId: string,
  moduleId: unknown,
  sectionId?: unknown,
  questionId?: unknown,
): Promise<Location | null> {
  if (typeof moduleId !== "string" || !(await moduleInClassroom(moduleId, classroomId)))
    return null;
  let section: { id: string; module_id: string } | null = null;
  if (sectionId !== undefined) {
    if (typeof sectionId !== "string") return null;
    section = unwrap(
      await supabase.from("sections").select("id,module_id").eq("id", sectionId).maybeSingle(),
    ) as { id: string; module_id: string } | null;
    if (!section || section.module_id !== moduleId) return null;
  }
  if (questionId !== undefined) {
    if (typeof questionId !== "string") return null;
    const question = unwrap(
      await supabase.from("questions").select("id,section_id").eq("id", questionId).maybeSingle(),
    ) as { id: string; section_id: string } | null;
    if (!question) return null;
    const questionSection = section ?? (unwrap(
      await supabase.from("sections").select("id,module_id").eq("id", question.section_id).maybeSingle(),
    ) as { id: string; module_id: string } | null);
    if (!questionSection || questionSection.id !== question.section_id || questionSection.module_id !== moduleId)
      return null;
    section = questionSection;
  }
  return { moduleId, sectionId: section?.id ?? null, questionId: typeof questionId === "string" ? questionId : null };
}

async function saveState(
  studentId: string,
  classroomId: string,
  location: Location,
  type: StudentActivityType,
): Promise<StudentActivity> {
  const row = unwrap(
    await supabase
      .from("student_activity_state")
      .upsert(
        {
          student_id: studentId,
          classroom_id: classroomId,
          module_id: location.moduleId,
          section_id: location.sectionId,
          question_id: location.questionId,
          type,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id" },
      )
      .select("*")
      .single(),
  ) as StateRow;
  return fromState(row);
}

function broadcast(
  classroomId: string,
  studentId: string,
  active: StudentActivity,
  activity?: StudentActivity,
  work?: ReturnType<typeof toStudentWork>,
) {
  emitStudentActivityUpdate({ type: "student_activity_update", classroomId, studentId, active, activity, work });
}

activityRouter.put("/work", requireRole("student"), async (req, res) => {
  const body = (req.body ?? {}) as Partial<SaveStudentWorkRequest>;
  if (
    typeof body.value !== "string" ||
    body.value.length > 25_000 ||
    (body.kind !== "answer" && body.kind !== "code")
  )
    return res.status(400).json({ error: "Invalid student work" });
  const location = await validLocation(
    req.user!.classroomId,
    body.moduleId,
    body.sectionId,
    body.questionId,
  );
  if (!location?.questionId || !location.sectionId)
    return res.status(400).json({ error: "Invalid question location" });
  const question = unwrap(
    await supabase.from("questions").select("kind").eq("id", location.questionId).single(),
  ) as { kind: string };
  if ((body.kind === "code") !== (question.kind === "code"))
    return res.status(400).json({ error: "Work type does not match this question" });
  const existing = unwrap(
    await supabase
      .from("student_work")
      .select("*")
      .eq("student_id", req.user!.userId)
      .eq("question_id", location.questionId)
      .maybeSingle(),
  ) as StudentWorkRow | null;
  const unchanged =
    (body.kind === "answer" ? existing?.answer : existing?.code) === body.value;
  const row = unwrap(
    await supabase
      .from("student_work")
      .upsert(
        {
          id: `${req.user!.userId}:${location.questionId}`,
          student_id: req.user!.userId,
          question_id: location.questionId,
          answer: body.kind === "answer" ? body.value : null,
          code: body.kind === "code" ? body.value : null,
          is_correct: unchanged ? existing?.is_correct ?? null : null,
          checked_at: unchanged ? existing?.checked_at ?? null : null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "student_id,question_id" },
      )
      .select("*")
      .single(),
  ) as StudentWorkRow;
  const active = await saveState(
    req.user!.userId,
    req.user!.classroomId,
    location,
    body.kind === "code" ? "writing_code" : "answering_question",
  );
  const work = toStudentWork(row);
  broadcast(req.user!.classroomId, req.user!.userId, active, undefined, work);
  res.json(work);
});

activityRouter.post("/", requireRole("student"), async (req, res) => {
  const body = (req.body ?? {}) as Partial<RecordStudentActivityRequest>;
  const type = body.type as StudentActivityType;
  if (!activityTypes.includes(type))
    return res.status(400).json({ error: "Invalid activity type" });
  const location = await validLocation(
    req.user!.classroomId,
    body.moduleId,
    body.sectionId,
    body.questionId,
  );
  if (!location || (type !== "viewing_lesson" && !location.questionId))
    return res.status(400).json({ error: "Invalid activity location" });
  const record = unwrap(
    await supabase
      .from("student_activities")
      .insert({
        id: randomUUID(),
        student_id: req.user!.userId,
        classroom_id: req.user!.classroomId,
        module_id: location.moduleId,
        section_id: location.sectionId,
        question_id: location.questionId,
        type,
      })
      .select("*")
      .single(),
  ) as StudentActivityRow;
  const active = await saveState(req.user!.userId, req.user!.classroomId, location, type);
  const activity = toStudentActivity(record);
  broadcast(req.user!.classroomId, req.user!.userId, active, activity);
  res.status(201).json(activity);
});

activityRouter.get("/work", requireRole("student"), async (req, res) => {
  const moduleId = req.query.moduleId;
  if (typeof moduleId !== "string" || !(await moduleInClassroom(moduleId, req.user!.classroomId)))
    return res.status(400).json({ error: "Invalid module" });
  const sections = unwrap(
    await supabase.from("sections").select("id").eq("module_id", moduleId),
  ) as Array<{ id: string }>;
  const sectionIds = sections.map((section) => section.id);
  const questions = sectionIds.length
    ? (unwrap(await supabase.from("questions").select("id").in("section_id", sectionIds)) as Array<{ id: string }>)
    : [];
  const questionIds = questions.map((question) => question.id);
  const work = questionIds.length
    ? (unwrap(
        await supabase.from("student_work").select("*").eq("student_id", req.user!.userId).in("question_id", questionIds),
      ) as StudentWorkRow[])
    : [];
  const body: GetStudentWorkResponse = work.map(toStudentWork);
  res.json(body);
});

activityRouter.get("/classrooms/:id", requireRole("teacher"), async (req, res) => {
  const classroomId = String(req.params.id);
  if (classroomId !== req.user!.classroomId)
    return res.status(403).json({ error: "Not a member of this classroom" });
  const memberships = unwrap(
    await supabase.from("memberships").select("user_id").eq("classroom_id", classroomId).eq("role", "student"),
  ) as Array<{ user_id: string }>;
  const studentIds = memberships.map((membership) => membership.user_id);
  if (!studentIds.length) return res.json([] satisfies GetClassroomStudentActivityResponse);
  const [states, activities, modules] = await Promise.all([
    supabase.from("student_activity_state").select("*").eq("classroom_id", classroomId),
    supabase.from("student_activities").select("*").eq("classroom_id", classroomId).order("created_at", { ascending: false }).limit(150),
    supabase.from("modules").select("id").eq("classroom_id", classroomId),
  ]).then((results) => results.map(unwrap));
  const moduleIds = (modules as Array<{ id: string }>).map((module) => module.id);
  const sections = moduleIds.length
    ? (unwrap(await supabase.from("sections").select("id").in("module_id", moduleIds)) as Array<{ id: string }>)
    : [];
  const sectionIds = sections.map((section) => section.id);
  const questions = sectionIds.length
    ? (unwrap(await supabase.from("questions").select("id").in("section_id", sectionIds)) as Array<{ id: string }>)
    : [];
  const questionIds = questions.map((question) => question.id);
  const work = questionIds.length
    ? (unwrap(
        await supabase.from("student_work").select("*").in("student_id", studentIds).in("question_id", questionIds).order("updated_at", { ascending: false }),
      ) as StudentWorkRow[])
    : [];
  const stateByStudent = new Map(
    (states as StateRow[]).map((state) => [state.student_id, fromState(state)]),
  );
  const response: GetClassroomStudentActivityResponse = studentIds.map((studentId): StudentActivitySnapshot => ({
    studentId,
    active: stateByStudent.get(studentId) ?? null,
    recent: (activities as StudentActivityRow[])
      .filter((activity) => activity.student_id === studentId)
      .slice(0, 6)
      .map(toStudentActivity),
    work: (work as StudentWorkRow[])
      .filter((entry) => entry.student_id === studentId)
      .map(toStudentWork),
  }));
  res.json(response);
});
