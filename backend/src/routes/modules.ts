import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireRole } from "../auth.js";
import { moduleInClassroom } from "../access.js";
import { supabase } from "../supabase.js";
import {
  toBlock,
  toCheck,
  toExercise,
  toModule,
  toOption,
  toQuestion,
  toReference,
  toSection,
  unwrap,
  type BlockRow,
  type CheckRow,
  type ExerciseRow,
  type ModuleRow,
  type OptionRow,
  type QuestionRow,
  type ReferenceRow,
  type SectionRow,
} from "../rows.js";
import type {
  CreateBlockRequest,
  CreateCodeCheckRequest,
  CreateModuleRequest,
  CreateOptionRequest,
  CreateQuestionRequest,
  CreateReferenceAnswerRequest,
  CreateSectionRequest,
  GetStudentModuleResponse,
  GetTeacherModuleResponse,
  QuestionKind,
  TeacherModule,
  UpdateBlockRequest,
  UpdateCodeCheckRequest,
  UpdateModuleRequest,
  UpdateOptionRequest,
  UpdateQuestionRequest,
  UpdateReferenceAnswerRequest,
  UpdateSectionRequest,
  UpsertCodeExerciseRequest,
} from "../../../shared/types.js";

export const modulesRouter = Router();
const kinds: QuestionKind[] = ["mcq", "short", "code"];
const validPosition = (value: unknown) =>
  value === undefined || (Number.isInteger(value) && (value as number) >= 0);
const nextPosition = async (
  table: string,
  column: string,
  parentId: string,
) => {
  const rows = unwrap(
    await supabase
      .from(table)
      .select("position")
      .eq(column, parentId)
      .order("position", { ascending: false })
      .limit(1),
  ) as { position: number }[];
  return (rows[0]?.position ?? -1) + 1;
};
/**
 * Position PATCHes represent insertion at the requested sibling position.
 * Re-numbering the sibling set prevents duplicate positions from making the
 * secondary ID sort determine a move's result.
 */
const moveWithinSiblings = async (
  table: string,
  parentColumn: string,
  parentId: string,
  id: string,
  requestedPosition: number,
) => {
  const siblings = unwrap(
    await supabase
      .from(table)
      .select("id, position")
      .eq(parentColumn, parentId)
      .order("position")
      .order("id"),
  ) as { id: string; position: number }[];
  const currentIndex = siblings.findIndex((sibling) => sibling.id === id);
  if (currentIndex < 0) return requestedPosition;
  const [moving] = siblings.splice(currentIndex, 1);
  const targetIndex = siblings.findIndex(
    (sibling) => sibling.position >= requestedPosition,
  );
  siblings.splice(targetIndex < 0 ? siblings.length : targetIndex, 0, moving);
  for (const [position, sibling] of siblings.entries()) {
    unwrap(
      await supabase.from(table).update({ position }).eq("id", sibling.id),
    );
  }
  return siblings.findIndex((sibling) => sibling.id === id);
};

export async function aggregate(
  module: ModuleRow,
  teacher: true,
): Promise<GetTeacherModuleResponse>;
export async function aggregate(
  module: ModuleRow,
  teacher: false,
): Promise<GetStudentModuleResponse>;
export async function aggregate(
  module: ModuleRow,
  teacher: boolean,
): Promise<GetTeacherModuleResponse | GetStudentModuleResponse> {
  const sections = unwrap(
    await supabase
      .from("sections")
      .select("*")
      .eq("module_id", module.id)
      .order("position")
      .order("id"),
  ) as SectionRow[];
  const sectionIds = sections.map((s) => s.id);
  const [blocks, questions] = sectionIds.length
    ? ((await Promise.all([
        supabase
          .from("section_blocks")
          .select("*")
          .in("section_id", sectionIds)
          .order("position")
          .order("id"),
        supabase
          .from("questions")
          .select("*")
          .in("section_id", sectionIds)
          .order("position")
          .order("id"),
      ]).then((r) => r.map(unwrap))) as [BlockRow[], QuestionRow[]])
    : [[], []];
  const questionIds = questions.map((q) => q.id);
  const [options, exercises] = questionIds.length
    ? ((await Promise.all([
        supabase
          .from("question_options")
          .select("*")
          .in("question_id", questionIds)
          .order("position")
          .order("id"),
        supabase
          .from("code_exercises")
          .select("*")
          .in("question_id", questionIds),
      ]).then((r) => r.map(unwrap))) as [OptionRow[], ExerciseRow[]])
    : [[], []];
  const exerciseIds = exercises.map((e) => e.id);
  const [references, checks] =
    teacher && exerciseIds.length
      ? ((await Promise.all([
          supabase
            .from("reference_answers")
            .select("*")
            .in("code_exercise_id", exerciseIds)
            .order("position")
            .order("id"),
          supabase
            .from("code_checks")
            .select("*")
            .in("code_exercise_id", exerciseIds)
            .order("position")
            .order("id"),
        ]).then((r) => r.map(unwrap))) as [ReferenceRow[], CheckRow[]])
      : [[], []];
  const result = {
    ...toModule(module),
    sections: sections.map((section) => ({
      ...toSection(section),
      blocks: blocks.filter((b) => b.section_id === section.id).map(toBlock),
      questions: questions
        .filter((q) => q.section_id === section.id)
        .map((q) => {
          const exercise = exercises.find((e) => e.question_id === q.id);
          return {
            ...toQuestion(q),
            options: options
              .filter((o) => o.question_id === q.id)
              .map(toOption),
            ...(teacher ? { answerKey: q.answer_key } : {}),
            ...(exercise
              ? {
                  codeExercise: teacher
                    ? {
                        ...toExercise(exercise),
                        referenceAnswers: references
                          .filter((r) => r.code_exercise_id === exercise.id)
                          .map(toReference),
                        checks: checks
                          .filter((c) => c.code_exercise_id === exercise.id)
                          .map(toCheck),
                      }
                    : toExercise(exercise),
                }
              : {}),
          };
        }),
    })),
  };
  return result;
}
async function ownedModule(
  req: any,
  res: any,
  id: string | string[],
): Promise<ModuleRow | null> {
  const module = await moduleInClassroom(String(id), req.user!.classroomId);
  if (!module) res.status(404).json({ error: "Module not found" });
  return module;
}
async function ownedSection(
  req: any,
  res: any,
  id: string | string[],
): Promise<SectionRow | null> {
  const section = unwrap(
    await supabase
      .from("sections")
      .select("*")
      .eq("id", String(id))
      .maybeSingle(),
  ) as SectionRow | null;
  if (!section || !(await ownedModule(req, res, section.module_id)))
    return null;
  return section;
}
async function ownedQuestion(
  req: any,
  res: any,
  id: string | string[],
): Promise<QuestionRow | null> {
  const question = unwrap(
    await supabase
      .from("questions")
      .select("*")
      .eq("id", String(id))
      .maybeSingle(),
  ) as QuestionRow | null;
  if (!question || !(await ownedSection(req, res, question.section_id)))
    return null;
  return question;
}

modulesRouter.get("/:id", async (req, res) => {
  const module = await ownedModule(req, res, req.params.id);
  if (!module) return;
  if (req.user!.role === "teacher") res.json(await aggregate(module, true));
  else res.json(await aggregate(module, false));
});
modulesRouter.post("/", requireRole("teacher"), async (req, res) => {
  const body = (req.body ?? {}) as Partial<CreateModuleRequest>;
  if (
    typeof body.title !== "string" ||
    !body.title.trim() ||
    (body.content !== undefined && typeof body.content !== "string") ||
    !validPosition(body.position)
  )
    return res
      .status(400)
      .json({ error: "title, content and position are invalid" });
  const position =
    body.position ??
    (await nextPosition("modules", "classroom_id", req.user!.classroomId));
  const row = unwrap(
    await supabase
      .from("modules")
      .insert({
        id: randomUUID(),
        classroom_id: req.user!.classroomId,
        title: body.title.trim(),
        content: body.content ?? "",
        position,
      })
      .select("*")
      .single(),
  ) as ModuleRow;
  res.status(201).json(toModule(row));
});
modulesRouter.patch("/:id", requireRole("teacher"), async (req, res) => {
  const current = await ownedModule(req, res, req.params.id);
  if (!current) return;
  const body = (req.body ?? {}) as UpdateModuleRequest;
  if (
    (body.title !== undefined &&
      (typeof body.title !== "string" || !body.title.trim())) ||
    (body.content !== undefined && typeof body.content !== "string") ||
    !validPosition(body.position)
  )
    return res.status(400).json({ error: "Invalid module fields" });
  const position =
    body.position === undefined
      ? current.position
      : await moveWithinSiblings(
          "modules",
          "classroom_id",
          current.classroom_id,
          current.id,
          body.position,
        );
  const row = unwrap(
    await supabase
      .from("modules")
      .update({
        title: body.title?.trim() ?? current.title,
        content: body.content ?? current.content,
        position,
      })
      .eq("id", current.id)
      .select("*")
      .single(),
  ) as ModuleRow;
  res.json(toModule(row));
});
modulesRouter.delete("/:id", requireRole("teacher"), async (req, res) => {
  const m = await ownedModule(req, res, req.params.id);
  if (!m) return;
  unwrap(await supabase.from("modules").delete().eq("id", m.id));
  res.status(204).end();
});

modulesRouter.post(
  "/:id/sections",
  requireRole("teacher"),
  async (req, res) => {
    const m = await ownedModule(req, res, req.params.id);
    const b = req.body as Partial<CreateSectionRequest>;
    if (!m) return;
    if (
      typeof b?.title !== "string" ||
      !b.title.trim() ||
      !validPosition(b.position)
    )
      return res.status(400).json({ error: "Invalid section fields" });
    const position =
      b.position ?? (await nextPosition("sections", "module_id", m.id));
    res.status(201).json(
      toSection(
        unwrap(
          await supabase
            .from("sections")
            .insert({
              id: randomUUID(),
              module_id: m.id,
              title: b.title.trim(),
              position,
            })
            .select("*")
            .single(),
        ) as SectionRow,
      ),
    );
  },
);
modulesRouter.patch(
  "/sections/:id",
  requireRole("teacher"),
  async (req, res) => {
    const s = await ownedSection(req, res, req.params.id);
    const b = req.body as UpdateSectionRequest;
    if (!s) return;
    if (
      (b.title !== undefined &&
        (typeof b.title !== "string" || !b.title.trim())) ||
      !validPosition(b.position)
    )
      return res.status(400).json({ error: "Invalid section fields" });
    const position =
      b.position === undefined
        ? s.position
        : await moveWithinSiblings(
            "sections",
            "module_id",
            s.module_id,
            s.id,
            b.position,
          );
    res.json(
      toSection(
        unwrap(
          await supabase
            .from("sections")
            .update({
              title: b.title?.trim() ?? s.title,
              position,
            })
            .eq("id", s.id)
            .select("*")
            .single(),
        ) as SectionRow,
      ),
    );
  },
);
modulesRouter.delete(
  "/sections/:id",
  requireRole("teacher"),
  async (req, res) => {
    const s = await ownedSection(req, res, req.params.id);
    if (!s) return;
    unwrap(await supabase.from("sections").delete().eq("id", s.id));
    res.status(204).end();
  },
);

modulesRouter.post(
  "/sections/:id/blocks",
  requireRole("teacher"),
  async (req, res) => {
    const s = await ownedSection(req, res, req.params.id);
    const b = req.body as Partial<CreateBlockRequest>;
    if (!s) return;
    if (
      typeof b?.type !== "string" ||
      !b.type.trim() ||
      b.content === undefined ||
      !validPosition(b.position)
    )
      return res.status(400).json({ error: "Invalid block fields" });
    const position =
      b.position ?? (await nextPosition("section_blocks", "section_id", s.id));
    res.status(201).json(
      toBlock(
        unwrap(
          await supabase
            .from("section_blocks")
            .insert({
              id: randomUUID(),
              section_id: s.id,
              type: b.type.trim(),
              content: b.content,
              position,
            })
            .select("*")
            .single(),
        ) as BlockRow,
      ),
    );
  },
);
modulesRouter.patch("/blocks/:id", requireRole("teacher"), async (req, res) => {
  const block = unwrap(
    await supabase
      .from("section_blocks")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle(),
  ) as BlockRow | null;
  const b = req.body as UpdateBlockRequest;
  if (!block || !(await ownedSection(req, res, block.section_id))) return;
  if (
    (b.type !== undefined && (typeof b.type !== "string" || !b.type.trim())) ||
    !validPosition(b.position)
  )
    return res.status(400).json({ error: "Invalid block fields" });
  const position =
    b.position === undefined
      ? block.position
      : await moveWithinSiblings(
          "section_blocks",
          "section_id",
          block.section_id,
          block.id,
          b.position,
        );
  res.json(
    toBlock(
      unwrap(
        await supabase
          .from("section_blocks")
          .update({
            type: b.type?.trim() ?? block.type,
            content: b.content === undefined ? block.content : b.content,
            position,
          })
          .eq("id", block.id)
          .select("*")
          .single(),
      ) as BlockRow,
    ),
  );
});
modulesRouter.delete(
  "/blocks/:id",
  requireRole("teacher"),
  async (req, res) => {
    const b = unwrap(
      await supabase
        .from("section_blocks")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle(),
    ) as BlockRow | null;
    if (!b || !(await ownedSection(req, res, b.section_id))) return;
    unwrap(await supabase.from("section_blocks").delete().eq("id", b.id));
    res.status(204).end();
  },
);

modulesRouter.post(
  "/sections/:id/questions",
  requireRole("teacher"),
  async (req, res) => {
    const s = await ownedSection(req, res, req.params.id);
    const b = req.body as Partial<CreateQuestionRequest>;
    if (!s) return;
    if (
      typeof b?.prompt !== "string" ||
      !b.prompt.trim() ||
      !kinds.includes(b.kind as QuestionKind) ||
      (b.answerKey !== undefined &&
        b.answerKey !== null &&
        typeof b.answerKey !== "string") ||
      (b.kind === "mcq" && b.answerKey !== undefined && b.answerKey !== null) ||
      !validPosition(b.position)
    )
      return res.status(400).json({ error: "Invalid question fields" });
    const position =
      b.position ?? (await nextPosition("questions", "section_id", s.id));
    const row = unwrap(
      await supabase
        .from("questions")
        .insert({
          id: randomUUID(),
          section_id: s.id,
          prompt: b.prompt.trim(),
          kind: b.kind,
          answer_key: b.answerKey ?? null,
          position,
        })
        .select("*")
        .single(),
    ) as QuestionRow;
    res.status(201).json({ ...toQuestion(row), answerKey: row.answer_key });
  },
);
modulesRouter.patch(
  "/questions/:id",
  requireRole("teacher"),
  async (req, res) => {
    const q = await ownedQuestion(req, res, req.params.id);
    const b = req.body as UpdateQuestionRequest;
    if (!q) return;
    if (
      (b.prompt !== undefined &&
        (typeof b.prompt !== "string" || !b.prompt.trim())) ||
      (b.kind !== undefined && !kinds.includes(b.kind)) ||
      (b.answerKey !== undefined &&
        b.answerKey !== null &&
        typeof b.answerKey !== "string") ||
      !validPosition(b.position)
    )
      return res.status(400).json({ error: "Invalid question fields" });
    if (b.kind !== undefined && b.kind !== q.kind) {
      const [optionsResult, exerciseResult] = await Promise.all([
        supabase
          .from("question_options")
          .select("id")
          .eq("question_id", q.id)
          .limit(1),
        supabase
          .from("code_exercises")
          .select("id")
          .eq("question_id", q.id)
          .maybeSingle(),
      ]);
      const options = unwrap(optionsResult) as { id: string }[];
      const exercise = unwrap(exerciseResult) as { id: string } | null;
      if (options.length || exercise)
        return res.status(409).json({
          error:
            "Delete the question's options or code exercise before changing its kind",
        });
    }
    if (
      b.answerKey !== undefined &&
      b.answerKey !== null &&
      (b.kind ?? q.kind) === "mcq"
    ) {
      const option = unwrap(
        await supabase
          .from("question_options")
          .select("id")
          .eq("id", b.answerKey)
          .eq("question_id", q.id)
          .maybeSingle(),
      );
      if (!option)
        return res.status(400).json({
          error:
            "MCQ answerKey must be an option ID belonging to this question",
        });
    }
    const position =
      b.position === undefined
        ? q.position
        : await moveWithinSiblings(
            "questions",
            "section_id",
            q.section_id,
            q.id,
            b.position,
          );
    const row = unwrap(
      await supabase
        .from("questions")
        .update({
          prompt: b.prompt?.trim() ?? q.prompt,
          kind: b.kind ?? q.kind,
          answer_key: b.answerKey === undefined ? q.answer_key : b.answerKey,
          position,
        })
        .eq("id", q.id)
        .select("*")
        .single(),
    ) as QuestionRow;
    res.json({ ...toQuestion(row), answerKey: row.answer_key });
  },
);
modulesRouter.delete(
  "/questions/:id",
  requireRole("teacher"),
  async (req, res) => {
    const q = await ownedQuestion(req, res, req.params.id);
    if (!q) return;
    unwrap(await supabase.from("questions").delete().eq("id", q.id));
    res.status(204).end();
  },
);

// Options, exercise, references and checks all resolve their parent question/exercise before writes.
modulesRouter.post(
  "/questions/:id/options",
  requireRole("teacher"),
  async (req, res) => {
    const q = await ownedQuestion(req, res, req.params.id);
    const b = req.body as Partial<CreateOptionRequest>;
    if (!q) return;
    if (
      q.kind !== "mcq" ||
      typeof b?.text !== "string" ||
      !b.text.trim() ||
      !validPosition(b.position)
    )
      return res.status(400).json({ error: "MCQ option fields are invalid" });
    const position =
      b.position ??
      (await nextPosition("question_options", "question_id", q.id));
    res.status(201).json(
      toOption(
        unwrap(
          await supabase
            .from("question_options")
            .insert({
              id: randomUUID(),
              question_id: q.id,
              text: b.text.trim(),
              position,
            })
            .select("*")
            .single(),
        ) as OptionRow,
      ),
    );
  },
);
modulesRouter.patch(
  "/options/:id",
  requireRole("teacher"),
  async (req, res) => {
    const o = unwrap(
      await supabase
        .from("question_options")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle(),
    ) as OptionRow | null;
    const b = req.body as UpdateOptionRequest;
    if (!o || !(await ownedQuestion(req, res, o.question_id))) return;
    if (
      (b.text !== undefined &&
        (typeof b.text !== "string" || !b.text.trim())) ||
      !validPosition(b.position)
    )
      return res.status(400).json({ error: "Invalid option fields" });
    const position =
      b.position === undefined
        ? o.position
        : await moveWithinSiblings(
            "question_options",
            "question_id",
            o.question_id,
            o.id,
            b.position,
          );
    res.json(
      toOption(
        unwrap(
          await supabase
            .from("question_options")
            .update({
              text: b.text?.trim() ?? o.text,
              position,
            })
            .eq("id", o.id)
            .select("*")
            .single(),
        ) as OptionRow,
      ),
    );
  },
);
modulesRouter.delete(
  "/options/:id",
  requireRole("teacher"),
  async (req, res) => {
    const o = unwrap(
      await supabase
        .from("question_options")
        .select("*")
        .eq("id", req.params.id)
        .maybeSingle(),
    ) as OptionRow | null;
    if (!o) return;
    const question = await ownedQuestion(req, res, o.question_id);
    if (!question) return;
    if (question.answer_key === o.id)
      return res.status(409).json({
        error: "Clear or replace this option's answerKey before deleting it",
      });
    unwrap(await supabase.from("question_options").delete().eq("id", o.id));
    res.status(204).end();
  },
);

modulesRouter.put(
  "/questions/:id/exercise",
  requireRole("teacher"),
  async (req, res) => {
    const q = await ownedQuestion(req, res, req.params.id);
    const b = req.body as Partial<UpsertCodeExerciseRequest>;
    if (!q) return;
    if (
      q.kind !== "code" ||
      typeof b?.language !== "string" ||
      typeof b.starterCode !== "string" ||
      typeof b.instructions !== "string"
    )
      return res
        .status(400)
        .json({ error: "Code exercise fields are invalid" });
    const row = unwrap(
      await supabase
        .from("code_exercises")
        .upsert(
          {
            id: `exercise-${q.id}`,
            question_id: q.id,
            language: b.language,
            starter_code: b.starterCode,
            instructions: b.instructions,
          },
          { onConflict: "question_id" },
        )
        .select("*")
        .single(),
    ) as ExerciseRow;
    res.json(toExercise(row));
  },
);

async function exerciseFor(
  req: any,
  res: any,
  id: string | string[],
): Promise<ExerciseRow | null> {
  const e = unwrap(
    await supabase
      .from("code_exercises")
      .select("*")
      .eq("id", String(id))
      .maybeSingle(),
  ) as ExerciseRow | null;
  if (!e || !(await ownedQuestion(req, res, e.question_id))) return null;
  return e;
}
function childCrud(
  base: string,
  table: "reference_answers" | "code_checks",
  create: (
    b: any,
    exerciseId: string,
    position: number,
  ) => Record<string, unknown>,
  update: (b: any, old: any) => Record<string, unknown>,
  valid: (b: any, partial: boolean) => boolean,
  map: (row: any) => unknown,
) {
  modulesRouter.post(
    `/exercises/:id/${base}`,
    requireRole("teacher"),
    async (req, res) => {
      const e = await exerciseFor(req, res, req.params.id);
      const b = req.body as any;
      if (!e || !b || typeof b !== "object") return;
      if (!valid(b, false))
        return res.status(400).json({ error: "Invalid authoring fields" });
      const position =
        b.position ?? (await nextPosition(table, "code_exercise_id", e.id));
      if (!validPosition(position))
        return res.status(400).json({ error: "Invalid position" });
      const row = unwrap(
        await supabase
          .from(table)
          .insert(create(b, e.id, position))
          .select("*")
          .single(),
      );
      res.status(201).json(map(row));
    },
  );
  modulesRouter.patch(
    `/${base}/:id`,
    requireRole("teacher"),
    async (req, res) => {
      const old = unwrap(
        await supabase
          .from(table)
          .select("*")
          .eq("id", req.params.id)
          .maybeSingle(),
      ) as any;
      if (!old || !(await exerciseFor(req, res, old.code_exercise_id))) return;
      if (!valid(req.body ?? {}, true))
        return res.status(400).json({ error: "Invalid authoring fields" });
      const position =
        req.body?.position === undefined
          ? old.position
          : await moveWithinSiblings(
              table,
              "code_exercise_id",
              old.code_exercise_id,
              old.id,
              req.body.position,
            );
      const row = unwrap(
        await supabase
          .from(table)
          .update(update({ ...(req.body ?? {}), position }, old))
          .eq("id", old.id)
          .select("*")
          .single(),
      );
      res.json(map(row));
    },
  );
  modulesRouter.delete(
    `/${base}/:id`,
    requireRole("teacher"),
    async (req, res) => {
      const old = unwrap(
        await supabase
          .from(table)
          .select("*")
          .eq("id", req.params.id)
          .maybeSingle(),
      ) as any;
      if (!old || !(await exerciseFor(req, res, old.code_exercise_id))) return;
      unwrap(await supabase.from(table).delete().eq("id", old.id));
      res.status(204).end();
    },
  );
}
childCrud(
  "references",
  "reference_answers",
  (b: CreateReferenceAnswerRequest, id, position) => ({
    id: randomUUID(),
    code_exercise_id: id,
    title: b.title,
    answer: b.answer,
    position,
  }),
  (b: UpdateReferenceAnswerRequest, old) => ({
    title: b.title ?? old.title,
    answer: b.answer ?? old.answer,
    position: b.position ?? old.position,
  }),
  (b, partial) =>
    typeof b === "object" &&
    (partial
      ? (b.title === undefined ||
          (typeof b.title === "string" && b.title.trim())) &&
        (b.answer === undefined || typeof b.answer === "string") &&
        validPosition(b.position)
      : typeof b.title === "string" &&
        b.title.trim() &&
        typeof b.answer === "string" &&
        validPosition(b.position)),
  toReference,
);
childCrud(
  "checks",
  "code_checks",
  (b: CreateCodeCheckRequest, id, position) => ({
    id: randomUUID(),
    code_exercise_id: id,
    name: b.name,
    description: b.description,
    position,
  }),
  (b: UpdateCodeCheckRequest, old) => ({
    name: b.name ?? old.name,
    description: b.description ?? old.description,
    position: b.position ?? old.position,
  }),
  (b, partial) =>
    typeof b === "object" &&
    (partial
      ? (b.name === undefined ||
          (typeof b.name === "string" && b.name.trim())) &&
        (b.description === undefined || typeof b.description === "string") &&
        validPosition(b.position)
      : typeof b.name === "string" &&
        b.name.trim() &&
        typeof b.description === "string" &&
        validPosition(b.position)),
  toCheck,
);
