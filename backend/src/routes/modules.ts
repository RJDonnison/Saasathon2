import { randomUUID } from "node:crypto";
import { Router } from "express";
import { requireRole } from "../auth.js";
import { moduleInClassroom } from "../access.js";
import { supabase } from "../supabase.js";
import { emitModuleChanged } from "../sockets.js";
import {
  toBlock,
  toCheck,
  toExercise,
  toModule,
  toOption,
  toQuestion,
  toReference,
  toSection,
  toSectionItem,
  unwrap,
  type BlockRow,
  type CheckRow,
  type ExerciseRow,
  type ModuleRow,
  type OptionRow,
  type QuestionRow,
  type ReferenceRow,
  type SectionRow,
  type SectionItemRow,
} from "../rows.js";
import type {
  CreateBlockRequest,
  CreateCodeCheckRequest,
  CreateModuleRequest,
  CreateOptionRequest,
  CreateQuestionRequest,
  CreateReferenceAnswerRequest,
  CreateSectionRequest,
  GetModuleResponse,
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
  ModuleBuilderDocument,
  SaveModuleBuilderRequest,
} from "../../../shared/types.js";

export const modulesRouter = Router();
const kinds: QuestionKind[] = ["mcq", "short", "code"];
const validPosition = (value: unknown) =>
  value === undefined || (Number.isInteger(value) && (value as number) >= 0);

function validDocument(value: unknown): value is ModuleBuilderDocument {
  if (!value || typeof value !== "object") return false;
  const d = value as ModuleBuilderDocument;
  return (
    typeof d.title === "string" &&
    typeof d.content === "string" &&
    (d.status === "draft" || d.status === "published") &&
    Array.isArray(d.sections) &&
    d.sections.every(
      (s) =>
        typeof s.id === "string" &&
        typeof s.title === "string" &&
        Array.isArray(s.items) &&
        s.items.every(
          (i) =>
            typeof i.id === "string" &&
            (i.type === "block"
              ? typeof i.blockType === "string" && Object.hasOwn(i, "content")
              : i.type === "question" &&
                typeof i.prompt === "string" &&
                kinds.includes(i.kind) &&
                (i.answerKey === null || typeof i.answerKey === "string") &&
                Array.isArray(i.options) &&
                i.options.every((option) => typeof option === "string") &&
                (i.language === undefined || typeof i.language === "string") &&
                (i.starterCode === undefined ||
                  typeof i.starterCode === "string") &&
                (i.instructions === undefined ||
                  typeof i.instructions === "string") &&
                (i.hiddenCode === undefined ||
                  typeof i.hiddenCode === "string") &&
                (i.referenceAnswers === undefined ||
                  (Array.isArray(i.referenceAnswers) &&
                    i.referenceAnswers.every(
                      (reference) =>
                        reference &&
                        typeof reference.id === "string" &&
                        typeof reference.title === "string" &&
                        typeof reference.answer === "string",
                    ))) &&
                (i.checks === undefined ||
                  (Array.isArray(i.checks) &&
                    i.checks.every(
                      (check) =>
                        check &&
                        typeof check.id === "string" &&
                        typeof check.name === "string" &&
                        typeof check.description === "string",
                    )))),
        ),
    )
  );
}

/** Replaces a draft document after a compare-and-swap revision bump. Writes are serialized by the revision guard. */
async function saveBuilder(
  current: ModuleRow,
  document: ModuleBuilderDocument,
  revision: number,
) {
  const claimed = unwrap(
    await supabase
      .from("modules")
      .update({
        title: document.title.trim(),
        content: document.content,
        status: document.status,
        revision: revision + 1,
      })
      .eq("id", current.id)
      .eq("revision", revision)
      .select("*")
      .maybeSingle(),
  ) as ModuleRow | null;
  if (!claimed) return null;
  // Delete/recreate is one compact document write. IDs from the editor are stable UUIDs; child tables cascade.
  const oldSections = unwrap(
    await supabase.from("sections").select("id").eq("module_id", current.id),
  ) as { id: string }[];
  if (oldSections.length)
    unwrap(
      await supabase
        .from("sections")
        .delete()
        .in(
          "id",
          oldSections.map((s) => s.id),
        ),
    );
  for (
    let sectionPosition = 0;
    sectionPosition < document.sections.length;
    sectionPosition++
  ) {
    const section = document.sections[sectionPosition];
    unwrap(
      await supabase.from("sections").insert({
        id: section.id,
        module_id: current.id,
        title: section.title.trim() || "Untitled section",
        position: sectionPosition,
      }),
    );
    for (let position = 0; position < section.items.length; position++) {
      const item = section.items[position];
      if (item.type === "block") {
        unwrap(
          await supabase.from("section_blocks").insert({
            id: item.id,
            section_id: section.id,
            type: item.blockType,
            content: item.content,
            position,
          }),
        );
        unwrap(
          await supabase.from("section_items").insert({
            id: randomUUID(),
            section_id: section.id,
            item_type: "block",
            item_id: item.id,
            position,
          }),
        );
      } else {
        unwrap(
          await supabase.from("questions").insert({
            id: item.id,
            section_id: section.id,
            prompt: item.prompt,
            kind: item.kind,
            answer_key: item.answerKey,
            position,
          }),
        );
        unwrap(
          await supabase.from("section_items").insert({
            id: randomUUID(),
            section_id: section.id,
            item_type: "question",
            item_id: item.id,
            position,
          }),
        );
        if (item.kind === "mcq")
          for (
            let optionPosition = 0;
            optionPosition < item.options.length;
            optionPosition++
          )
            unwrap(
              await supabase.from("question_options").insert({
                id: randomUUID(),
                question_id: item.id,
                text: item.options[optionPosition],
                position: optionPosition,
              }),
            );
        if (item.kind === "code") {
          const exerciseId = `exercise-${item.id}`;
          unwrap(
            await supabase.from("code_exercises").insert({
              id: exerciseId,
              question_id: item.id,
              language: item.language || "javascript",
              starter_code: item.starterCode || "",
              instructions: item.instructions || "",
              hidden_code: item.hiddenCode || "",
            }),
          );
          for (
            let referencePosition = 0;
            referencePosition < (item.referenceAnswers?.length ?? 0);
            referencePosition++
          ) {
              const reference = item.referenceAnswers![referencePosition];
              unwrap(
                await supabase.from("reference_answers").insert({
                  id: reference.id,
                  code_exercise_id: exerciseId,
                  title: reference.title,
                  answer: reference.answer,
                  position: referencePosition,
                }),
              );
          }
          for (
            let checkPosition = 0;
            checkPosition < (item.checks?.length ?? 0);
            checkPosition++
          ) {
            const check = item.checks![checkPosition];
            unwrap(
              await supabase.from("code_checks").insert({
                id: check.id,
                code_exercise_id: exerciseId,
                name: check.name,
                description: check.description,
                position: checkPosition,
              }),
            );
          }
        }
      }
    }
  }
  return claimed;
}
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

export async function aggregate(
  module: ModuleRow,
  teacher: boolean,
): Promise<GetModuleResponse> {
  const sections = unwrap(
    await supabase
      .from("sections")
      .select("*")
      .eq("module_id", module.id)
      .order("position")
      .order("id"),
  ) as SectionRow[];
  const sectionIds = sections.map((s) => s.id);
  const [blocks, questions, items] = sectionIds.length
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
        supabase
          .from("section_items")
          .select("*")
          .in("section_id", sectionIds)
          .order("position")
          .order("id"),
      ]).then((r) => r.map(unwrap))) as [
        BlockRow[],
        QuestionRow[],
        SectionItemRow[],
      ])
    : [[], [], []];
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
                        hiddenCode: exercise.hidden_code,
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
      items: (() => {
        const stored = items
          .filter((item) => item.section_id === section.id)
          .map(toSectionItem);
        if (stored.length) return stored;
        const legacyBlocks = blocks.filter(
          (block) => block.section_id === section.id,
        );
        const legacyQuestions = questions.filter(
          (question) => question.section_id === section.id,
        );
        return [
          ...legacyBlocks.map((block, position) => ({
            id: `legacy-block-${block.id}`,
            sectionId: section.id,
            itemType: "block" as const,
            itemId: block.id,
            position,
          })),
          ...legacyQuestions.map((question, index) => ({
            id: `legacy-question-${question.id}`,
            sectionId: section.id,
            itemType: "question" as const,
            itemId: question.id,
            position: legacyBlocks.length + index,
          })),
        ];
      })(),
    })),
  };
  return result as TeacherModule;
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

modulesRouter.post("/builder", requireRole("teacher"), async (req, res) => {
  const document = (req.body ?? {}).document as unknown;
  if (!validDocument(document) || !document.title.trim())
    return res.status(400).json({ error: "Invalid module document" });
  const position = await nextPosition(
    "modules",
    "classroom_id",
    req.user!.classroomId,
  );
  const created = unwrap(
    await supabase
      .from("modules")
      .insert({
        id: randomUUID(),
        classroom_id: req.user!.classroomId,
        title: document.title.trim(),
        content: document.content,
        position,
        status: document.status,
        revision: 0,
      })
      .select("*")
      .single(),
  ) as ModuleRow;
  const saved = await saveBuilder(created, document, 0);
  if (!saved)
    return res
      .status(409)
      .json({ error: "Module changed. Reload and try again." });
  const module = (await aggregate(saved, true)) as TeacherModule;
  emitModuleChanged({
    type: "module_changed",
    classroomId: saved.classroom_id,
    moduleId: saved.id,
    revision: saved.revision,
  });
  res.status(201).json({ module });
});

modulesRouter.put("/:id/builder", requireRole("teacher"), async (req, res) => {
  const current = await ownedModule(req, res, req.params.id);
  const body = (req.body ?? {}) as Partial<SaveModuleBuilderRequest>;
  if (!current) return;
  if (
    !Number.isInteger(body.revision) ||
    body.revision! < 0 ||
    !validDocument(body.document) ||
    !body.document.title.trim()
  )
    return res
      .status(400)
      .json({ error: "A valid revision and module document are required" });
  const saved = await saveBuilder(current, body.document, body.revision!);
  if (!saved)
    return res
      .status(409)
      .json({ error: "Module changed. Reload and try again." });
  const module = (await aggregate(saved, true)) as TeacherModule;
  emitModuleChanged({
    type: "module_changed",
    classroomId: saved.classroom_id,
    moduleId: saved.id,
    revision: saved.revision,
  });
  res.json({ module });
});

modulesRouter.get("/:id", async (req, res) => {
  const module = await ownedModule(req, res, req.params.id);
  if (module && (req.user!.role === "teacher" || module.status === "published"))
    res.json(await aggregate(module, req.user!.role === "teacher"));
  else if (module) res.status(404).json({ error: "Module not found" });
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
        // Legacy endpoint remains immediately visible as before; the builder uses /builder for drafts.
        status: "published",
        revision: 0,
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
  const row = unwrap(
    await supabase
      .from("modules")
      .update({
        title: body.title?.trim() ?? current.title,
        content: body.content ?? current.content,
        position: body.position ?? current.position,
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
    res.json(
      toSection(
        unwrap(
          await supabase
            .from("sections")
            .update({
              title: b.title?.trim() ?? s.title,
              position: b.position ?? s.position,
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
  res.json(
    toBlock(
      unwrap(
        await supabase
          .from("section_blocks")
          .update({
            type: b.type?.trim() ?? block.type,
            content: b.content === undefined ? block.content : b.content,
            position: b.position ?? block.position,
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
    const row = unwrap(
      await supabase
        .from("questions")
        .update({
          prompt: b.prompt?.trim() ?? q.prompt,
          kind: b.kind ?? q.kind,
          answer_key: b.answerKey === undefined ? q.answer_key : b.answerKey,
          position: b.position ?? q.position,
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
    res.json(
      toOption(
        unwrap(
          await supabase
            .from("question_options")
            .update({
              text: b.text?.trim() ?? o.text,
              position: b.position ?? o.position,
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
    if (!o || !(await ownedQuestion(req, res, o.question_id))) return;
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
      typeof b.instructions !== "string" ||
      (b.hiddenCode !== undefined && typeof b.hiddenCode !== "string")
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
            hidden_code: b.hiddenCode ?? "",
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
) {
  modulesRouter.post(
    `/exercises/:id/${base}`,
    requireRole("teacher"),
    async (req, res) => {
      const e = await exerciseFor(req, res, req.params.id);
      const b = req.body as any;
      if (!e || !b || typeof b !== "object") return;
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
      res.status(201).json(row);
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
      const row = unwrap(
        await supabase
          .from(table)
          .update(update(req.body ?? {}, old))
          .eq("id", old.id)
          .select("*")
          .single(),
      );
      res.json(row);
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
);
