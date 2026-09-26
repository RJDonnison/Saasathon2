import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireRole } from "../auth.js";
import { moduleForUser } from "../access.js";
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

type ResolvedLocation = Location & { questionKind: string | null };
type SectionRef = { id: string; module_id: string };
const one = <T>(value: T | T[] | null | undefined): T | null =>
  (Array.isArray(value) ? value[0] : value) ?? null;

/**
 * Resolve every client supplied location through the lesson hierarchy before saving it. The module, section and
 * question lookups don't depend on each other (the question brings its section along), so they go out together.
 */
async function validLocation(
  classroomId: string,
  moduleId: unknown,
  sectionId?: unknown,
  questionId?: unknown,
): Promise<ResolvedLocation | null> {
  if (typeof moduleId !== "string") return null;
  if (sectionId !== undefined && typeof sectionId !== "string") return null;
  if (questionId !== undefined && typeof questionId !== "string") return null;
  const [module, sectionResult, questionResult] = await Promise.all([
    moduleForUser(moduleId, classroomId, "student"),
    sectionId !== undefined
      ? supabase.from("sections").select("id,module_id").eq("id", sectionId as string).maybeSingle()
      : null,
    questionId !== undefined
      ? supabase
          .from("questions")
          .select("id,kind,section_id, sections(id,module_id)")
          .eq("id", questionId as string)
          .maybeSingle()
      : null,
  ]);
  if (!module) return null;
  let section: SectionRef | null = null;
  if (sectionResult) {
    section = unwrap(sectionResult) as SectionRef | null;
    if (!section || section.module_id !== moduleId) return null;
  }
  let question: { id: string; kind: string; section_id: string } | null = null;
  if (questionResult) {
    const row = unwrap(questionResult) as unknown as
      | { id: string; kind: string; section_id: string; sections: SectionRef | SectionRef[] | null }
      | null;
    if (!row) return null;
    question = row;
    // The question must sit in the requested section, or (if none was named) in a section of this module.
    const questionSection: SectionRef | null = section ?? one(row.sections);
    if (!questionSection || questionSection.id !== row.section_id || questionSection.module_id !== moduleId)
      return null;
    section = questionSection;
  }
  return {
    moduleId,
    sectionId: section?.id ?? null,
    questionId: question?.id ?? null,
    questionKind: question?.kind ?? null,
  };
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
  // The caller's saved copy of this answer is looked up alongside the location check; it is only used if the
  // location turns out to be valid.
  const [location, existingResult] = await Promise.all([
    validLocation(req.user!.classroomId, body.moduleId, body.sectionId, body.questionId),
    typeof body.questionId === "string"
      ? supabase
          .from("student_work")
          .select("*")
          .eq("student_id", req.user!.userId)
          .eq("question_id", body.questionId)
          .maybeSingle()
      : null,
  ]);
  if (!location?.questionId || !location.sectionId)
    return res.status(400).json({ error: "Invalid question location" });
  if ((body.kind === "code") !== (location.questionKind === "code"))
    return res.status(400).json({ error: "Work type does not match this question" });
  const existing = (existingResult ? unwrap(existingResult) : null) as StudentWorkRow | null;
  const unchanged =
    (body.kind === "answer" ? existing?.answer : existing?.code) === body.value;
  // Saving the work and updating the live "what is this student doing" state are independent writes.
  const [workResult, active] = await Promise.all([
    supabase
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
    saveState(
      req.user!.userId,
      req.user!.classroomId,
      location,
      body.kind === "code" ? "writing_code" : "answering_question",
    ),
  ]);
  const work = toStudentWork(unwrap(workResult) as StudentWorkRow);
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
  const [recordResult, active] = await Promise.all([
    supabase
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
    saveState(req.user!.userId, req.user!.classroomId, location, type),
  ]);
  const activity = toStudentActivity(unwrap(recordResult) as StudentActivityRow);
  broadcast(req.user!.classroomId, req.user!.userId, active, activity);
  res.status(201).json(activity);
});

activityRouter.get("/work", requireRole("student"), async (req, res) => {
  const moduleId = req.query.moduleId;
  if (typeof moduleId !== "string") return res.status(400).json({ error: "Invalid module" });
  // The lesson's questions are reached by joining up to the module, so this is one query beside the access check.
  const [module, workResult] = await Promise.all([
    moduleForUser(moduleId, req.user!.classroomId, "student"),
    supabase
      .from("student_work")
      .select("*, questions!inner(sections!inner(module_id))")
      .eq("student_id", req.user!.userId)
      .eq("questions.sections.module_id", moduleId),
  ]);
  if (!module) return res.status(400).json({ error: "Invalid module" });
  const work = (unwrap(workResult) as unknown as Array<StudentWorkRow & { questions?: unknown }>).map(
    ({ questions: _path, ...row }) => row,
  );
  const body: GetStudentWorkResponse = work.map(toStudentWork);
  res.json(body);
});

activityRouter.get("/classrooms/:id", requireRole("teacher"), async (req, res) => {
  const classroomId = String(req.params.id);
  if (classroomId !== req.user!.classroomId)
    return res.status(403).json({ error: "Not a member of this classroom" });
  // The teacher's roll-call polls this, so everything goes out in one wave. Work reaches the classroom through
  // inner joins (question -> section -> module) rather than by first collecting every id in the classroom.
  const [memberships, states, activities, workResult] = await Promise.all([
    supabase.from("memberships").select("user_id").eq("classroom_id", classroomId).eq("role", "student"),
    supabase.from("student_activity_state").select("*").eq("classroom_id", classroomId),
    supabase.from("student_activities").select("*").eq("classroom_id", classroomId).order("created_at", { ascending: false }).limit(150),
    supabase
      .from("student_work")
      .select("*, questions!inner(sections!inner(modules!inner(classroom_id)))")
      .eq("questions.sections.modules.classroom_id", classroomId)
      .order("updated_at", { ascending: false }),
  ]);
  const studentIds = (unwrap(memberships) as Array<{ user_id: string }>).map((membership) => membership.user_id);
  if (!studentIds.length) return res.json([] satisfies GetClassroomStudentActivityResponse);
  const enrolled = new Set(studentIds);
  const work = (unwrap(workResult) as unknown as Array<StudentWorkRow & { questions?: unknown }>)
    .filter((entry) => enrolled.has(entry.student_id))
    .map(({ questions: _path, ...row }) => row);
  const stateByStudent = new Map(
    (unwrap(states) as StateRow[]).map((state) => [state.student_id, fromState(state)]),
  );
  const recent = unwrap(activities) as StudentActivityRow[];
  const response: GetClassroomStudentActivityResponse = studentIds.map((studentId): StudentActivitySnapshot => ({
    studentId,
    active: stateByStudent.get(studentId) ?? null,
    recent: recent
      .filter((activity) => activity.student_id === studentId)
      .slice(0, 6)
      .map(toStudentActivity),
    work: work.filter((entry) => entry.student_id === studentId).map(toStudentWork),
  }));
  res.json(response);
});
