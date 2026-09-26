import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import Eyebrow from "../ui/Eyebrow.tsx";
import Heading from "../ui/Heading.tsx";
import { INPUT, TINT } from "../ui/styles.ts";
import type {
  AiModuleSuggestion,
  ModuleBuilderDocument,
  QuestionKind,
  TeacherModule,
} from "../../../shared/types";

const id = () => crypto.randomUUID();
type BuilderItem = ModuleBuilderDocument["sections"][number]["items"][number];
type BuilderQuestion = Extract<BuilderItem, { type: "question" }>;

const blank = (): ModuleBuilderDocument => ({
  title: "Untitled module",
  content: "",
  status: "draft",
  sections: [{ id: id(), title: "Section 1", items: [] }],
});

const questionLabel: Record<QuestionKind, string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  code: "Code exercise",
  math: "Math question",
};

function newQuestion(kind: QuestionKind): BuilderQuestion {
  return {
    id: id(),
    type: "question",
    prompt: "",
    kind,
    answerKey: null,
    options: kind === "mcq" ? ["", ""] : [],
    ...(kind === "math"
      ? { mathExpectedResult: 0, mathTolerance: 0 }
      : {}),
    ...(kind === "code"
      ? {
          language: "javascript",
          starterCode: "",
          instructions: "",
          hiddenCode: "",
          referenceAnswers: [],
          checks: [],
        }
      : {}),
  };
}

function documentFrom(module: TeacherModule): ModuleBuilderDocument {
  return {
    title: module.title,
    content: module.content,
    status: module.status,
    sections: module.sections.map((section) => {
      const blocks = new Map(section.blocks.map((block) => [block.id, block]));
      const questions = new Map(
        section.questions.map((question) => [question.id, question]),
      );
      return {
        id: section.id,
        title: section.title,
        items: section.items.flatMap<BuilderItem>((item) => {
          const block = blocks.get(item.itemId);
          if (item.itemType === "block" && block)
            return [
              {
                id: block.id,
                type: "block" as const,
                blockType: block.type,
                content: block.content,
              },
            ];
          const question = questions.get(item.itemId);
          if (item.itemType !== "question" || !question) return [];
          return [
            {
              id: question.id,
              type: "question" as const,
              prompt: question.prompt,
              kind: question.kind,
              answerKey: question.answerKey,
              mathExpectedResult: question.mathExpectedResult,
              mathTolerance: question.mathTolerance,
              options: question.options.map((option) => option.text),
              language: question.codeExercise?.language,
              starterCode: question.codeExercise?.starterCode,
              instructions: question.codeExercise?.instructions,
              hiddenCode: question.codeExercise?.hiddenCode,
              referenceAnswers: question.codeExercise?.referenceAnswers.map(
                (reference) => ({
                  id: reference.id,
                  title: reference.title,
                  answer: reference.answer,
                }),
              ),
              checks: question.codeExercise?.checks.map((check) => ({
                id: check.id,
                name: check.name,
                description: check.description,
              })),
            },
          ];
        }),
      };
    }),
  };
}

export default function ModuleBuilder() {
  const { id: moduleId } = useParams();
  const navigate = useNavigate();
  const [document, setDocument] = useState<ModuleBuilderDocument>(blank);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(Boolean(moduleId));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | undefined>();
  const [idea, setIdea] = useState("");
  const [suggestions, setSuggestions] = useState<AiModuleSuggestion[]>([]);
  const [undo, setUndo] = useState<ModuleBuilderDocument | null>(null);

  useEffect(() => {
    if (!moduleId) return;
    api
      .getModule(moduleId)
      .then((module) => {
        const teacher = module as TeacherModule;
        setDocument(documentFrom(teacher));
        setRevision(teacher.revision);
      })
      .catch((error) =>
        setNotice(error instanceof Error ? error.message : "Could not load module"),
      )
      .finally(() => setLoading(false));
  }, [moduleId]);

  const itemCount = useMemo(
    () =>
      document.sections.reduce(
        (total, section) => total + section.items.length,
        0,
      ),
    [document],
  );

  function change(fn: (old: ModuleBuilderDocument) => ModuleBuilderDocument) {
    setDocument(fn);
  }

  function updateItem(itemId: string, patch: (item: BuilderItem) => BuilderItem) {
    change((old) => ({
      ...old,
      sections: old.sections.map((section) => ({
        ...section,
        items: section.items.map((item) =>
          item.id === itemId ? patch(item) : item,
        ),
      })),
    }));
  }

  function moveItem(sectionId: string, itemId: string, direction: -1 | 1) {
    change((old) => ({
      ...old,
      sections: old.sections.map((section) => {
        if (section.id !== sectionId) return section;
        const current = section.items.findIndex((item) => item.id === itemId);
        const destination = current + direction;
        if (current < 0 || destination < 0 || destination >= section.items.length)
          return section;
        const items = [...section.items];
        [items[current], items[destination]] = [
          items[destination],
          items[current],
        ];
        return { ...section, items };
      }),
    }));
  }

  function removeItem(itemId: string) {
    setSelected((current) => (current === itemId ? undefined : current));
    change((old) => ({
      ...old,
      sections: old.sections.map((section) => ({
        ...section,
        items: section.items.filter((item) => item.id !== itemId),
      })),
    }));
  }

  async function save(publish = false) {
    setSaving(true);
    setNotice(null);
    const next = {
      ...document,
      status: publish ? ("published" as const) : document.status,
    };
    try {
      const result = moduleId
        ? await api.saveBuilderModule(moduleId, revision, next)
        : await api.createBuilderModule(next);
      setDocument(documentFrom(result.module));
      setRevision(result.module.revision);
      if (!moduleId)
        navigate(`/teacher/modules/${result.module.id}`, { replace: true });
      setNotice(
        result.module.status === "published"
          ? "Published changes are live for students."
          : "Draft saved. Students cannot see it.",
      );
    } catch (error) {
      setNotice(
        error instanceof ApiClientError && error.status === 409
          ? "This module changed elsewhere. Reload before saving."
          : error instanceof Error
            ? error.message
            : "Could not save",
      );
    } finally {
      setSaving(false);
    }
  }

  async function askAi() {
    if (!moduleId || !idea.trim()) return;
    setNotice(null);
    try {
      setSuggestions(
        (
          await api.aiModuleSuggestions({
            moduleId,
            request: idea,
            itemId: selected,
          })
        ).suggestions,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not get suggestions",
      );
    }
  }

  function accept(patch: AiModuleSuggestion["patch"]) {
    setUndo(document);
    setDocument((old) => ({ ...old, ...patch }));
    setSuggestions([]);
  }

  if (loading) return <p className="m-0 text-muted">Loading module…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>Module builder</Eyebrow>
          <Heading as="h1" variant="title">
            Build a lesson
          </Heading>
          <p className="m-0 text-sm text-muted">
            {itemCount} lesson items ·{" "}
            {document.status === "draft"
              ? "Draft — hidden from students"
              : "Published"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            className="text-sm! font-semibold! text-muted hover:text-ink"
            to="/teacher"
          >
            Back to classroom
          </Link>
          <Button variant="default" disabled={saving} onClick={() => void save()}>
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button variant="primary" disabled={saving} onClick={() => void save(true)}>
            Publish
          </Button>
        </div>
      </div>

      {notice && (
        <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.mint}`}>
          {notice}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card
            title="Module details"
            eyebrow="Start here"
            bodyClassName="flex flex-col gap-4 p-5"
          >
            <label className="flex flex-col gap-2 text-sm text-muted">
              Module title
              <input
                className={`${INPUT} h-11`}
                value={document.title}
                onChange={(event) =>
                  change((old) => ({ ...old, title: event.target.value }))
                }
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-muted">
              Introduction
              <textarea
                className={`${INPUT} min-h-28 py-2.5`}
                value={document.content}
                onChange={(event) =>
                  change((old) => ({ ...old, content: event.target.value }))
                }
                placeholder="What will students learn in this module?"
              />
            </label>
          </Card>

          {document.sections.map((section, sectionIndex) => (
            <SectionEditor
              key={section.id}
              section={section}
              sectionIndex={sectionIndex}
              sectionCount={document.sections.length}
              selected={selected}
              onSelect={setSelected}
              onChangeTitle={(title) =>
                change((old) => ({
                  ...old,
                  sections: old.sections.map((current) =>
                    current.id === section.id ? { ...current, title } : current,
                  ),
                }))
              }
              onUpdateItem={updateItem}
              onAddItem={(item) =>
                change((old) => ({
                  ...old,
                  sections: old.sections.map((current) =>
                    current.id === section.id
                      ? { ...current, items: [...current.items, item] }
                      : current,
                  ),
                }))
              }
              onMoveItem={(itemId, direction) =>
                moveItem(section.id, itemId, direction)
              }
              onRemoveItem={removeItem}
              onRemoveSection={() =>
                change((old) => ({
                  ...old,
                  sections: old.sections.filter(
                    (current) => current.id !== section.id,
                  ),
                }))
              }
            />
          ))}

          <Button
            className="self-start"
            onClick={() =>
              change((old) => ({
                ...old,
                sections: [
                  ...old.sections,
                  {
                    id: id(),
                    title: `Section ${old.sections.length + 1}`,
                    items: [],
                  },
                ],
              }))
            }
          >
            + Add section
          </Button>
        </div>

        <aside
          aria-label="Writing assistant"
          className="min-w-0 lg:sticky lg:top-24 lg:h-[calc(100dvh-7rem)]"
        >
          <Card
            title="Writing assistant"
            eyebrow="Teacher only"
            className="flex h-full min-h-0 flex-col"
            bodyClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5"
          >
            <div
              className={`rounded-xl px-3 py-2.5 text-xs leading-relaxed ${TINT.lavender}`}
            >
              {selected
                ? "Your suggestion will use the selected lesson item as context."
                : "Select an item for more focused help, or ask about the whole lesson."}
            </div>
            <label className="flex flex-col gap-2 text-sm text-muted">
              What would you like to improve?
              <textarea
                className={`${INPUT} min-h-28 py-2.5`}
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder={
                  selected
                    ? "Make this clearer for beginners…"
                    : "Suggest a clearer introduction…"
                }
              />
            </label>
            {!moduleId && (
              <p className="m-0 text-xs leading-relaxed text-muted">
                Save this draft once to unlock suggestions based on your lesson.
              </p>
            )}
            <Button
              variant="primary"
              disabled={!moduleId || !idea.trim()}
              onClick={() => void askAi()}
            >
              Suggest improvements
            </Button>
            {suggestions.length > 0 && <Eyebrow>Suggestions</Eyebrow>}
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-3 text-sm"
              >
                <span className="leading-relaxed">{suggestion.label}</span>
                <Button
                  size="sm"
                  className="self-start"
                  onClick={() => accept(suggestion.patch)}
                >
                  Apply suggestion
                </Button>
              </div>
            ))}
            {undo && (
              <Button
                size="sm"
                className="self-start"
                onClick={() => {
                  setDocument(undo);
                  setUndo(null);
                }}
              >
                Undo last suggestion
              </Button>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SectionEditor({
  section,
  sectionIndex,
  sectionCount,
  selected,
  onSelect,
  onChangeTitle,
  onUpdateItem,
  onAddItem,
  onMoveItem,
  onRemoveItem,
  onRemoveSection,
}: {
  section: ModuleBuilderDocument["sections"][number];
  sectionIndex: number;
  sectionCount: number;
  selected?: string;
  onSelect: (id: string) => void;
  onChangeTitle: (title: string) => void;
  onUpdateItem: (id: string, patch: (item: BuilderItem) => BuilderItem) => void;
  onAddItem: (item: BuilderItem) => void;
  onMoveItem: (id: string, direction: -1 | 1) => void;
  onRemoveItem: (id: string) => void;
  onRemoveSection: () => void;
}) {
  return (
    <Card
      title={`Section ${String(sectionIndex + 1).padStart(2, "0")}`}
      eyebrow="Lesson flow"
      action={
        sectionCount > 1 ? (
          <Button
            size="sm"
            onClick={onRemoveSection}
            aria-label={`Delete section ${sectionIndex + 1}`}
          >
            Delete
          </Button>
        ) : undefined
      }
      bodyClassName="flex flex-col gap-4 p-5"
    >
      <label className="flex flex-col gap-2 text-sm text-muted">
        Section title
        <input
          className={`${INPUT} h-10`}
          value={section.title}
          onChange={(event) => onChangeTitle(event.target.value)}
          placeholder="For example: Variables in practice"
        />
      </label>

      {section.items.length === 0 ? (
        <div className="flex flex-col gap-1 rounded-xl border border-dashed border-border bg-surface-soft px-4 py-5">
          <span className="text-sm font-medium text-ink">
            Build this section in order
          </span>
          <span className="text-xs leading-relaxed text-muted">
            Add reading, then a question or code exercise for students to practise.
          </span>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {section.items.map((item, itemIndex) => (
            <ItemEditor
              key={item.id}
              item={item}
              index={itemIndex}
              total={section.items.length}
              selected={selected === item.id}
              onSelect={() => onSelect(item.id)}
              onUpdate={(patch) => onUpdateItem(item.id, patch)}
              onMove={(direction) => onMoveItem(item.id, direction)}
              onRemove={() => onRemoveItem(item.id)}
            />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button
          size="sm"
          onClick={() =>
            onAddItem({
              id: id(),
              type: "block",
              blockType: "markdown",
              content: "",
            })
          }
        >
          + Reading
        </Button>
        <Button size="sm" onClick={() => onAddItem(newQuestion("mcq"))}>
          + Multiple choice
        </Button>
        <Button size="sm" onClick={() => onAddItem(newQuestion("short"))}>
          + Short answer
        </Button>
        <Button size="sm" onClick={() => onAddItem(newQuestion("code"))}>
          + Code exercise
        </Button>
        <Button size="sm" onClick={() => onAddItem(newQuestion("math"))}>
          + Math question
        </Button>
      </div>
    </Card>
  );
}

function ItemEditor({
  item,
  index,
  total,
  selected,
  onSelect,
  onUpdate,
  onMove,
  onRemove,
}: {
  item: BuilderItem;
  index: number;
  total: number;
  selected: boolean;
  onSelect: () => void;
  onUpdate: (patch: (item: BuilderItem) => BuilderItem) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const itemName = item.type === "block" ? "Reading" : questionLabel[item.kind];
  return (
    <article
      className={`flex flex-col gap-4 rounded-xl border p-4 transition ${selected ? "border-accent bg-surface-soft" : "border-border bg-surface"}`}
      onFocus={onSelect}
      onClick={onSelect}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span
            className={`grid size-7 place-items-center rounded-full font-mono text-[10px] ${item.type === "block" ? TINT.mint : TINT.peach}`}
          >
            {String(index + 1).padStart(2, "0")}
          </span>
          <span className="text-sm font-semibold text-ink">{itemName}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            size="sm"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={`Move ${itemName} up`}
          >
            Up
          </Button>
          <Button
            size="sm"
            disabled={index === total - 1}
            onClick={() => onMove(1)}
            aria-label={`Move ${itemName} down`}
          >
            Down
          </Button>
          <Button size="sm" onClick={onRemove} aria-label={`Delete ${itemName}`}>
            Delete
          </Button>
        </div>
      </div>

      {item.type === "block" ? (
        <label className="flex flex-col gap-2 text-sm text-muted">
          Reading content (Markdown supported)
          <textarea
            className={`${INPUT} min-h-36 py-2.5 font-mono! text-[13px]!`}
            value={
              typeof item.content === "string"
                ? item.content
                : JSON.stringify(item.content, null, 2)
            }
            onChange={(event) =>
              onUpdate((current) =>
                current.type === "block"
                  ? { ...current, content: event.target.value }
                  : current,
              )
            }
            placeholder="Explain the idea, then add an example…"
          />
        </label>
      ) : (
        <QuestionEditor item={item} onUpdate={onUpdate} />
      )}
    </article>
  );
}

function QuestionEditor({
  item,
  onUpdate,
}: {
  item: BuilderQuestion;
  onUpdate: (patch: (item: BuilderItem) => BuilderItem) => void;
}) {
  function updateQuestion(patch: (question: BuilderQuestion) => BuilderQuestion) {
    onUpdate((current) =>
      current.type === "question" ? patch(current) : current,
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <label className="flex flex-col gap-2 text-sm text-muted">
          Question type
          <select
            className={`${INPUT} h-10`}
            value={item.kind}
            onChange={(event) =>
              updateQuestion((question) =>
                changeQuestionKind(question, event.target.value as QuestionKind),
              )
            }
          >
            <option value="mcq">Multiple choice</option>
            <option value="short">Short answer</option>
            <option value="code">Code exercise</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          Prompt
          <textarea
            className={`${INPUT} min-h-24 py-2.5`}
            value={item.prompt}
            onChange={(event) =>
              updateQuestion((question) => ({
                ...question,
                prompt: event.target.value,
              }))
            }
            placeholder="What should students do or think about?"
          />
        </label>
      </div>

      {item.kind === "mcq" && (
        <MultipleChoiceEditor item={item} update={updateQuestion} />
      )}
      {item.kind === "short" && (
        <label className="flex flex-col gap-2 text-sm text-muted">
          Expected answer (teacher only)
          <textarea
            className={`${INPUT} min-h-20 py-2.5`}
            value={item.answerKey ?? ""}
            onChange={(event) =>
              updateQuestion((question) => ({
                ...question,
                answerKey: event.target.value || null,
              }))
            }
            placeholder="Add a model answer or key points…"
          />
        </label>
      )}
      {item.kind === "code" && (
        <CodeExerciseEditor item={item} update={updateQuestion} />
      )}
      {item.kind === "math" && (
        <MathQuestionEditor item={item} update={updateQuestion} />
      )}
    </div>
  );
}

function changeQuestionKind(
  question: BuilderQuestion,
  kind: QuestionKind,
): BuilderQuestion {
  const next = newQuestion(kind);
  return {
    ...next,
    id: question.id,
    prompt: question.prompt,
    answerKey: kind === "short" ? question.answerKey : null,
  };
}

function MathQuestionEditor({
  item,
  update,
}: {
  item: BuilderQuestion;
  update: (patch: (question: BuilderQuestion) => BuilderQuestion) => void;
}) {
  const updateNumber = (
    key: "mathExpectedResult" | "mathTolerance",
    value: string,
  ) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return;
    update((question) => ({ ...question, [key]: number }));
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="flex flex-col gap-2 text-sm text-muted">
        Expected result (teacher only)
        <input
          className={`${INPUT} h-10`}
          type="number"
          value={item.mathExpectedResult ?? 0}
          onChange={(event) =>
            updateNumber("mathExpectedResult", event.target.value)
          }
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-muted">
        Tolerance
        <input
          className={`${INPUT} h-10`}
          type="number"
          min="0"
          step="any"
          value={item.mathTolerance ?? 0}
          onChange={(event) => updateNumber("mathTolerance", event.target.value)}
        />
      </label>
    </div>
  );
}

function MultipleChoiceEditor({
  item,
  update,
}: {
  item: BuilderQuestion;
  update: (patch: (question: BuilderQuestion) => BuilderQuestion) => void;
}) {
  return (
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <legend className="text-sm font-medium text-ink">Answer choices</legend>
        <span className="text-xs text-muted">
          Choose the correct answer with the radio button.
        </span>
      </div>
      {item.options.map((option, optionIndex) => (
        <div key={`${item.id}-${optionIndex}`} className="flex items-center gap-2">
          <input
            type="radio"
            name={`correct-${item.id}`}
            checked={item.answerKey === option && option.trim().length > 0}
            onChange={() =>
              update((question) => ({ ...question, answerKey: option || null }))
            }
            aria-label={`Mark answer ${optionIndex + 1} as correct`}
            className="size-4 flex-none accent-ink"
          />
          <input
            className={`${INPUT} h-10 min-w-0 flex-1`}
            value={option}
            onChange={(event) =>
              update((question) => {
                const options = [...question.options];
                const previous = options[optionIndex];
                options[optionIndex] = event.target.value;
                return {
                  ...question,
                  options,
                  answerKey:
                    question.answerKey === previous
                      ? event.target.value || null
                      : question.answerKey,
                };
              })
            }
            placeholder={`Answer ${optionIndex + 1}`}
          />
          <Button
            size="sm"
            disabled={item.options.length <= 2}
            onClick={() =>
              update((question) => {
                const removed = question.options[optionIndex];
                return {
                  ...question,
                  options: question.options.filter(
                    (_, currentIndex) => currentIndex !== optionIndex,
                  ),
                  answerKey:
                    question.answerKey === removed ? null : question.answerKey,
                };
              })
            }
            aria-label={`Remove answer ${optionIndex + 1}`}
          >
            Remove
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        className="self-start"
        onClick={() =>
          update((question) => ({
            ...question,
            options: [...question.options, ""],
          }))
        }
      >
        + Add answer choice
      </Button>
    </fieldset>
  );
}

function CodeExerciseEditor({
  item,
  update,
}: {
  item: BuilderQuestion;
  update: (patch: (question: BuilderQuestion) => BuilderQuestion) => void;
}) {
  const references = item.referenceAnswers ?? [];
  const checks = item.checks ?? [];
  return (
    <div className="flex flex-col gap-5 border-t border-border pt-4">
      <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <label className="flex flex-col gap-2 text-sm text-muted">
          Language
          <select
            className={`${INPUT} h-10`}
            value={item.language ?? "javascript"}
            onChange={(event) =>
              update((question) => ({ ...question, language: event.target.value }))
            }
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          Student instructions
          <textarea
            className={`${INPUT} min-h-20 py-2.5`}
            value={item.instructions ?? ""}
            onChange={(event) =>
              update((question) => ({
                ...question,
                instructions: event.target.value,
              }))
            }
            placeholder="Describe the expected input, output, and constraints."
          />
        </label>
      </div>
      <label className="flex flex-col gap-2 text-sm text-muted">
        Starter code / skeleton
        <textarea
          className={`${INPUT} min-h-44 py-2.5 font-mono! text-[13px]!`}
          value={item.starterCode ?? ""}
          onChange={(event) =>
            update((question) => ({
              ...question,
              starterCode: event.target.value,
            }))
          }
          placeholder={'function solve(input) {\n  // Start here\n}'}
          spellCheck={false}
        />
      </label>
      <label className="flex flex-col gap-2 text-sm text-muted">
        Hidden test code
        <span className="text-xs leading-relaxed text-muted">
          Appended only on the server when a student runs this exercise. Use it to call their function with test cases and throw an error when one fails; it is never returned in lesson data.
        </span>
        <textarea
          className={`${INPUT} min-h-36 py-2.5 font-mono! text-[13px]!`}
          value={item.hiddenCode ?? ""}
          onChange={(event) =>
            update((question) => ({
              ...question,
              hiddenCode: event.target.value,
            }))
          }
          placeholder={'// Example: call the student\'s function with several inputs\nif (add(2, 3) !== 5) throw new Error("2 + 3 should equal 5")'}
          spellCheck={false}
        />
      </label>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">Reference answers</span>
            <span className="text-xs text-muted">
              Teacher-only examples; students never see these.
            </span>
          </div>
          <Button
            size="sm"
            onClick={() =>
              update((question) => ({
                ...question,
                referenceAnswers: [
                  ...(question.referenceAnswers ?? []),
                  { id: id(), title: "Example solution", answer: "" },
                ],
              }))
            }
          >
            + Add reference
          </Button>
        </div>
        {references.map((reference, referenceIndex) => (
          <div
            key={reference.id}
            className="flex flex-col gap-2 rounded-xl bg-surface-soft p-3"
          >
            <div className="flex gap-2">
              <input
                className={`${INPUT} h-10 min-w-0 flex-1`}
                value={reference.title}
                onChange={(event) =>
                  updateReference(update, referenceIndex, {
                    title: event.target.value,
                  })
                }
                placeholder="Solution title"
              />
              <Button
                size="sm"
                onClick={() =>
                  update((question) => ({
                    ...question,
                    referenceAnswers: (question.referenceAnswers ?? []).filter(
                      (_, currentIndex) => currentIndex !== referenceIndex,
                    ),
                  }))
                }
              >
                Remove
              </Button>
            </div>
            <textarea
              className={`${INPUT} min-h-28 py-2.5 font-mono! text-[13px]!`}
              value={reference.answer}
              onChange={(event) =>
                updateReference(update, referenceIndex, {
                  answer: event.target.value,
                })
              }
              placeholder="A teacher-only solution…"
              spellCheck={false}
            />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">
              Checks to consider
            </span>
            <span className="text-xs text-muted">
              Capture cases you want students’ solutions to handle.
            </span>
          </div>
          <Button
            size="sm"
            onClick={() =>
              update((question) => ({
                ...question,
                checks: [
                  ...(question.checks ?? []),
                  { id: id(), name: "New check", description: "" },
                ],
              }))
            }
          >
            + Add check
          </Button>
        </div>
        {checks.map((check, checkIndex) => (
          <div
            key={check.id}
            className="grid gap-2 rounded-xl bg-surface-soft p-3 sm:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_auto]"
          >
            <input
              className={`${INPUT} h-10 min-w-0`}
              value={check.name}
              onChange={(event) =>
                updateCheck(update, checkIndex, { name: event.target.value })
              }
              placeholder="Check name"
            />
            <input
              className={`${INPUT} h-10 min-w-0`}
              value={check.description}
              onChange={(event) =>
                updateCheck(update, checkIndex, {
                  description: event.target.value,
                })
              }
              placeholder="For example: accepts an empty list"
            />
            <Button
              size="sm"
              onClick={() =>
                update((question) => ({
                  ...question,
                  checks: (question.checks ?? []).filter(
                    (_, currentIndex) => currentIndex !== checkIndex,
                  ),
                }))
              }
            >
              Remove
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function updateReference(
  update: (patch: (question: BuilderQuestion) => BuilderQuestion) => void,
  index: number,
  patch: Partial<NonNullable<BuilderQuestion["referenceAnswers"]>[number]>,
) {
  update((question) => ({
    ...question,
    referenceAnswers: (question.referenceAnswers ?? []).map(
      (reference, currentIndex) =>
        currentIndex === index ? { ...reference, ...patch } : reference,
    ),
  }));
}

function updateCheck(
  update: (patch: (question: BuilderQuestion) => BuilderQuestion) => void,
  index: number,
  patch: Partial<NonNullable<BuilderQuestion["checks"]>[number]>,
) {
  update((question) => ({
    ...question,
    checks: (question.checks ?? []).map((check, currentIndex) =>
      currentIndex === index ? { ...check, ...patch } : check,
    ),
  }));
}
