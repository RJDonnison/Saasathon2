import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiClientError } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import Eyebrow from "../ui/Eyebrow.tsx";
import Heading from "../ui/Heading.tsx";
import Markdown from "../ui/Markdown.tsx";
import { INPUT, TINT } from "../ui/styles.ts";
import { onModuleDeleted } from "../socket.ts";
import CodeTestEditor from "./CodeTestEditor.tsx";
import TeacherCodeEditor from "./TeacherCodeEditor.tsx";
import type {
  AiModuleSuggestion,
  AiCodeTestCandidate,
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
const supportedLanguages = ["javascript", "typescript", "python"] as const;
type SupportedLanguage = (typeof supportedLanguages)[number];
const isSupportedLanguage = (language: string): language is SupportedLanguage =>
  supportedLanguages.some((supported) => supported === language);
const codeTemplates: Record<SupportedLanguage, string> = {
  javascript: "function solution(input) {\n  // Return your result\n}\n",
  typescript:
    "function solution(input: unknown): unknown {\n  // Return your result\n}\n",
  python: "def solution(input):\n    # Return your result\n    pass\n",
};
const languageGuidance: Record<SupportedLanguage, string> = {
  javascript:
    "Use a synchronous JavaScript function. Automated checks call the function name below.",
  typescript:
    "Use a synchronous TypeScript function. Keep the function name aligned with automated checks.",
  python:
    "Use a synchronous Python function. Set the function name below to the Python function students define.",
};

function newQuestion(kind: QuestionKind): BuilderQuestion {
  return {
    id: id(),
    type: "question",
    prompt: "",
    kind,
    answerKey: null,
    options: kind === "mcq" ? ["", ""] : [],
    ...(kind === "math" ? { mathExpectedResult: 0, mathTolerance: 0 } : {}),
    ...(kind === "code"
      ? {
          language: "javascript",
          starterCode: "",
          instructions: "",
          hiddenCode: "",
          functionName: "solution",
          referenceAnswers: [],
          checks: [],
          tests: [],
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
              codeExerciseId: question.codeExercise?.id,
              starterCode: question.codeExercise?.starterCode,
              instructions: question.codeExercise?.instructions,
              functionName: question.codeExercise?.functionName,
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
              tests: question.codeExercise?.tests.map((test) => ({
                id: test.id,
                name: test.name,
                args: test.args,
                expected: test.expected,
              })),
            },
          ];
        }),
      };
    }),
  };
}

/** AI may use placeholder ids for new material. Generate fresh ids for the full replacement before save. */
function withFreshIds(document: ModuleBuilderDocument): ModuleBuilderDocument {
  return {
    ...document,
    sections: document.sections.map((section) => ({
      ...section,
      id: id(),
      items: section.items.map((item) =>
        item.type === "block"
          ? { ...item, id: id() }
          : {
              ...item,
              id: id(),
              codeExerciseId: undefined,
              referenceAnswers: item.referenceAnswers?.map((reference) => ({
                ...reference,
                id: id(),
              })),
              checks: item.checks?.map((check) => ({ ...check, id: id() })),
              tests: item.tests?.map((test) => ({ ...test, id: id() })),
            },
      ),
    })),
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
  const [askingAi, setAskingAi] = useState(false);
  const [suggestions, setSuggestions] = useState<AiModuleSuggestion[]>([]);
  const [undo, setUndo] = useState<ModuleBuilderDocument | null>(null);
  const [introductionTab, setIntroductionTab] = useState<"write" | "preview">(
    "write",
  );

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
        setNotice(
          error instanceof Error ? error.message : "Could not load module",
        ),
      )
      .finally(() => setLoading(false));
  }, [moduleId]);

  useEffect(() => {
    if (!moduleId) return;
    return onModuleDeleted((event) => {
      if (event.moduleId === moduleId) {
        setNotice("This module was deleted.");
        navigate("/teacher", { replace: true });
      }
    });
  }, [moduleId, navigate]);

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

  function updateItem(
    itemId: string,
    patch: (item: BuilderItem) => BuilderItem,
  ) {
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
        if (
          current < 0 ||
          destination < 0 ||
          destination >= section.items.length
        )
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

  async function save(status?: "draft" | "published") {
    setSaving(true);
    setNotice(null);
    const next = {
      ...document,
      status: status ?? document.status,
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

  async function removeModule() {
    if (
      !moduleId ||
      !window.confirm(
        "Permanently delete this module and all of its lesson content?",
      )
    )
      return;
    setSaving(true);
    setNotice(null);
    try {
      await api.deleteModule(moduleId);
      navigate("/teacher", { replace: true });
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not delete module",
      );
    } finally {
      setSaving(false);
    }
  }

  async function askAi() {
    if (!idea.trim() || askingAi) return;
    setAskingAi(true);
    setNotice(null);
    try {
      const result = await api.aiModuleSuggestions({
        request: idea,
        document,
        selectedItemId: selected,
      });
      setSuggestions(result.suggestions);
      if (result.suggestions.length === 0)
        setNotice(
          "The assistant could not make a usable suggestion. Please try again.",
        );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Could not get suggestions",
      );
    } finally {
      setAskingAi(false);
    }
  }

  function accept(suggestion: AiModuleSuggestion) {
    if (!suggestion.document) return;
    setUndo(document);
    setDocument(withFreshIds(suggestion.document));
    setSelected(undefined);
    setSuggestions([]);
    setNotice("AI draft applied. Review it, then save when you are ready.");
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
          <Button
            variant="default"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving
              ? "Saving…"
              : document.status === "published"
                ? "Save published"
                : "Save draft"}
          </Button>
          {moduleId && (
            <Button
              variant="default"
              disabled={saving}
              onClick={() => void removeModule()}
            >
              Delete module
            </Button>
          )}
          {document.status === "published" ? (
            <Button
              variant="default"
              disabled={saving}
              onClick={() => void save("draft")}
            >
              Unpublish
            </Button>
          ) : (
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => void save("published")}
            >
              Publish
            </Button>
          )}
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
            <MarkdownTabs
              label="Introduction"
              value={document.content}
              tab={introductionTab}
              onTabChange={setIntroductionTab}
              onChange={(content) => change((old) => ({ ...old, content }))}
              placeholder="What will students learn in this module?"
            />
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
                : "Ask for a full lesson, reading, questions, exercises, or teaching advice."}
            </div>
            <label className="flex flex-col gap-2 text-sm text-muted">
              What would you like help with?
              <textarea
                className={`${INPUT} min-h-28 py-2.5`}
                value={idea}
                onChange={(event) => setIdea(event.target.value)}
                placeholder={
                  selected
                    ? "Rewrite this for beginners and add a quick check-for-understanding question…"
                    : "Create a 20-minute beginner lesson on loops with two questions…"
                }
              />
            </label>
            <Button
              variant="primary"
              disabled={askingAi || !idea.trim()}
              onClick={() => void askAi()}
            >
              {askingAi ? "Thinking…" : "Ask assistant"}
            </Button>
            {suggestions.length > 0 && <Eyebrow>Assistant response</Eyebrow>}
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-3 text-sm"
              >
                <span className="font-medium text-ink">{suggestion.label}</span>
                <p className="m-0 whitespace-pre-wrap text-muted">
                  {suggestion.reply}
                </p>
                {suggestion.document && (
                  <Button
                    size="sm"
                    className="self-start"
                    onClick={() => accept(suggestion)}
                  >
                    Apply to module
                  </Button>
                )}
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
            Add reading, then a question or code exercise for students to
            practise.
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
          <Button
            size="sm"
            onClick={onRemove}
            aria-label={`Delete ${itemName}`}
          >
            Delete
          </Button>
        </div>
      </div>

      {item.type === "block" ? (
        <ReadingEditor item={item} onUpdate={onUpdate} />
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
  function updateQuestion(
    patch: (question: BuilderQuestion) => BuilderQuestion,
  ) {
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
                changeQuestionKind(
                  question,
                  event.target.value as QuestionKind,
                ),
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

function MarkdownTabs({
  label,
  value,
  tab,
  onTabChange,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  tab: "write" | "preview";
  onTabChange: (tab: "write" | "preview") => void;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const editorId = `${label.replace(/\s/g, "-").toLowerCase()}-write`;
  const previewId = `${label.replace(/\s/g, "-").toLowerCase()}-preview`;
  const insert = (text: string) =>
    onChange(`${value}${value ? "\n\n" : ""}${text}`);
  const onTabsKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      onTabChange(tab === "write" ? "preview" : "write");
      document.getElementById(tab === "write" ? previewId : editorId)?.focus();
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm text-muted">
          {label} <span className="text-xs">(Markdown supported)</span>
        </span>
        <div
          role="tablist"
          aria-label={`${label} editor`}
          className="flex rounded-[10px] border border-border bg-surface-soft p-1"
          onKeyDown={onTabsKeyDown}
        >
          <button
            id={editorId}
            type="button"
            role="tab"
            aria-selected={tab === "write"}
            aria-controls={`${editorId}-panel`}
            tabIndex={tab === "write" ? 0 : -1}
            className={`rounded-[7px] px-3 py-1.5 text-sm! font-semibold! ${tab === "write" ? "bg-surface text-ink" : "text-muted"}`}
            onClick={() => onTabChange("write")}
          >
            Writing
          </button>
          <button
            id={previewId}
            type="button"
            role="tab"
            aria-selected={tab === "preview"}
            aria-controls={`${previewId}-panel`}
            tabIndex={tab === "preview" ? 0 : -1}
            className={`rounded-[7px] px-3 py-1.5 text-sm! font-semibold! ${tab === "preview" ? "bg-surface text-ink" : "text-muted"}`}
            onClick={() => onTabChange("preview")}
          >
            Preview
          </button>
        </div>
      </div>
      {tab === "write" ? (
        <div
          id={`${editorId}-panel`}
          role="tabpanel"
          aria-labelledby={editorId}
          className="flex flex-col gap-2"
        >
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => insert("## Heading")}>
              + Heading
            </Button>
            <Button size="sm" onClick={() => insert("- List item")}>
              + List
            </Button>
            <Button size="sm" onClick={() => insert("**Important idea**")}>
              + Bold
            </Button>
            <Button size="sm" onClick={() => insert("```\nexample code\n```")}>
              + Code
            </Button>
          </div>
          <label className="sr-only" htmlFor={`${editorId}-input`}>
            {label}
          </label>
          <textarea
            id={`${editorId}-input`}
            className={`${INPUT} min-h-28 py-2.5 font-mono! text-[13px]!`}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
          />
        </div>
      ) : (
        <div
          id={`${previewId}-panel`}
          role="tabpanel"
          aria-labelledby={previewId}
          className="rounded-xl border border-border bg-surface-soft p-4"
        >
          {value ? (
            <Markdown text={value} />
          ) : (
            <p className="m-0 text-sm text-muted">Nothing to preview yet.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ReadingEditor({
  item,
  onUpdate,
}: {
  item: Extract<BuilderItem, { type: "block" }>;
  onUpdate: (patch: (item: BuilderItem) => BuilderItem) => void;
}) {
  const [tab, setTab] = useState<"write" | "preview">("write");
  const content =
    typeof item.content === "string"
      ? item.content
      : JSON.stringify(item.content, null, 2);
  return (
    <MarkdownTabs
      label="Reading content"
      value={content}
      tab={tab}
      onTabChange={setTab}
      placeholder="Explain the idea, then add an example…"
      onChange={(content) =>
        onUpdate((current) =>
          current.type === "block" ? { ...current, content } : current,
        )
      }
    />
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
          onChange={(event) =>
            updateNumber("mathTolerance", event.target.value)
          }
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
        <div
          key={`${item.id}-${optionIndex}`}
          className="flex items-center gap-2"
        >
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
  const [testRequest, setTestRequest] = useState("");
  const [candidates, setCandidates] = useState<AiCodeTestCandidate[]>([]);
  const [generating, setGenerating] = useState(false);
  const [candidateNotice, setCandidateNotice] = useState<string | null>(null);
  const language = item.language ?? "javascript";
  const supportedLanguage = isSupportedLanguage(language)
    ? language
    : undefined;
  const applyTemplate = () => {
    if (!supportedLanguage) return;
    if (
      (item.starterCode ?? "").trim() &&
      !window.confirm(
        "Replace the current starter code with this language template?",
      )
    )
      return;
    update((question) => ({
      ...question,
      starterCode: codeTemplates[supportedLanguage],
    }));
  };
  const generateCandidates = async () => {
    if (!item.codeExerciseId || !testRequest.trim() || generating) return;
    setGenerating(true);
    setCandidateNotice(null);
    try {
      const result = await api.aiCodeTestCandidates({
        exerciseId: item.codeExerciseId,
        request: testRequest,
      });
      setCandidates(result.candidates);
      setCandidateNotice(result.warning ?? null);
    } catch (error) {
      setCandidateNotice(
        error instanceof Error
          ? error.message
          : "Could not generate test cases.",
      );
    } finally {
      setGenerating(false);
    }
  };
  const addCandidate = (candidate: AiCodeTestCandidate) => {
    update((question) => ({
      ...question,
      tests: [
        ...(question.tests ?? []),
        {
          id: id(),
          name: candidate.name,
          args: candidate.args,
          expected: candidate.expected,
        },
      ],
    }));
  };
  return (
    <div className="flex flex-col gap-5 border-t border-border pt-4">
      <div className="grid gap-4 sm:grid-cols-[11rem_minmax(0,1fr)]">
        <label className="flex flex-col gap-2 text-sm text-muted">
          Language
          <select
            className={`${INPUT} h-10`}
            value={language}
            onChange={(event) =>
              update((question) => ({
                ...question,
                language: event.target.value,
              }))
            }
          >
            <option value="javascript">JavaScript</option>
            <option value="typescript">TypeScript</option>
            <option value="python">Python</option>
            {!supportedLanguage && (
              <option value={language}>
                Unsupported saved language: {language}
              </option>
            )}
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
      <p className="m-0 text-xs text-muted">
        {supportedLanguage
          ? languageGuidance[supportedLanguage]
          : "Unsupported saved runtime value is preserved. Select a supported runtime before editing language-specific guidance."}
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm text-muted">Starter code / skeleton</span>
          {supportedLanguage && (
            <Button size="sm" onClick={applyTemplate}>
              Use {supportedLanguage} template
            </Button>
          )}
        </div>
        <span className="text-xs text-muted">
          {supportedLanguage
            ? "Templates are optional and only replace code after confirmation."
            : "This saved language is not a supported runtime. Choose a supported language to use a template."}
        </span>
        <TeacherCodeEditor
          label="Starter code / skeleton"
          language={language}
          value={item.starterCode ?? ""}
          onChange={(starterCode) =>
            update((question) => ({ ...question, starterCode }))
          }
          placeholder="Start students with a small function skeleton…"
        />
      </div>
      <label className="flex flex-col gap-2 text-sm text-muted">
        Function name for automated checks
        <input
          className={`${INPUT} h-10 font-mono!`}
          value={item.functionName ?? "solution"}
          onChange={(event) =>
            update((question) => ({
              ...question,
              functionName: event.target.value,
            }))
          }
          placeholder="solution"
        />
      </label>
      <div className="flex flex-col gap-2 text-sm text-muted">
        <span>Hidden test code</span>
        <span className="text-xs leading-relaxed text-muted">
          Appended only on the server when a student runs this exercise. Use it
          to call their function with test cases and throw an error when one
          fails; it is never returned in lesson data.
        </span>
        <TeacherCodeEditor
          label="Hidden test code"
          language={language}
          value={item.hiddenCode ?? ""}
          onChange={(hiddenCode) =>
            update((question) => ({ ...question, hiddenCode }))
          }
          placeholder={
            "// Call the student function and throw when a check fails"
          }
        />
      </div>

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">
              Reference answers
            </span>
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
            <TeacherCodeEditor
              label={`Reference answer ${referenceIndex + 1}`}
              language={language}
              value={reference.answer}
              onChange={(answer) =>
                updateReference(update, referenceIndex, { answer })
              }
              placeholder="A teacher-only solution…"
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
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">
              Automated tests
            </span>
            <span className="text-xs text-muted">
              Teacher-only JSON inputs and expected values used when students
              grade their code.
            </span>
          </div>
          <Button
            size="sm"
            onClick={() =>
              update((question) => ({
                ...question,
                tests: [
                  ...(question.tests ?? []),
                  { id: id(), name: "New test", args: [], expected: null },
                ],
              }))
            }
          >
            + Add test
          </Button>
        </div>
        {(item.tests ?? []).map((test, testIndex) => (
          <BuilderTestEditor
            key={test.id}
            test={test}
            onChange={(patch) =>
              update((question) => ({
                ...question,
                tests: (question.tests ?? []).map((current, index) =>
                  index === testIndex ? { ...current, ...patch } : current,
                ),
              }))
            }
            onRemove={() =>
              update((question) => ({
                ...question,
                tests: (question.tests ?? []).filter(
                  (_, index) => index !== testIndex,
                ),
              }))
            }
          />
        ))}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">
              Generate test candidates
            </span>
            <span className="text-xs text-muted">
              Describe behavior in plain language. Review suggestions before
              adding them to this draft.
            </span>
          </div>
          {item.codeExerciseId ? (
            <>
              <label className="flex flex-col gap-2 text-xs text-muted">
                Behavior to test
                <textarea
                  className={`${INPUT} min-h-20 py-2 font-mono! text-[13px]!`}
                  value={testRequest}
                  onChange={(event) => setTestRequest(event.target.value)}
                  placeholder="Add boundary cases for empty input and repeated values."
                />
              </label>
              <Button
                size="sm"
                className="self-start"
                variant="primary"
                disabled={generating || !testRequest.trim()}
                onClick={() => void generateCandidates()}
              >
                {generating ? "Generating…" : "Generate candidates"}
              </Button>
            </>
          ) : (
            <p className="m-0 text-xs text-muted">
              Save this module first to generate AI test candidates for this
              exercise.
            </p>
          )}
          {candidateNotice && (
            <p className={`m-0 rounded-xl px-3 py-2 text-xs ${TINT.peach}`}>
              {candidateNotice}
            </p>
          )}
          {candidates.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs text-muted">
                  Review each candidate before adding it.
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      candidates.forEach(addCandidate);
                      setCandidates([]);
                    }}
                  >
                    Add all
                  </Button>
                  <Button size="sm" onClick={() => setCandidates([])}>
                    Dismiss all
                  </Button>
                </div>
              </div>
              {candidates.map((candidate, index) => (
                <CandidateTestEditor
                  key={`${candidate.name}-${index}`}
                  candidate={candidate}
                  onChange={(next) =>
                    setCandidates((current) =>
                      current.map((value, currentIndex) =>
                        currentIndex === index ? next : value,
                      ),
                    )
                  }
                  onAdd={() => {
                    addCandidate(candidate);
                    setCandidates((current) =>
                      current.filter(
                        (_, currentIndex) => currentIndex !== index,
                      ),
                    );
                  }}
                  onDismiss={() =>
                    setCandidates((current) =>
                      current.filter(
                        (_, currentIndex) => currentIndex !== index,
                      ),
                    )
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CandidateTestEditor({
  candidate,
  onChange,
  onAdd,
  onDismiss,
}: {
  candidate: AiCodeTestCandidate;
  onChange: (candidate: AiCodeTestCandidate) => void;
  onAdd: () => void;
  onDismiss: () => void;
}) {
  return (
    <CodeTestEditor
      test={candidate}
      onChange={onChange}
      actions={
        <>
          <Button size="sm" onClick={onAdd}>
            Add
          </Button>
          <Button size="sm" onClick={onDismiss}>
            Dismiss
          </Button>
        </>
      }
    />
  );
}

function BuilderTestEditor({
  test,
  onChange,
  onRemove,
}: {
  test: NonNullable<BuilderQuestion["tests"]>[number];
  onChange: (
    patch: Partial<NonNullable<BuilderQuestion["tests"]>[number]>,
  ) => void;
  onRemove: () => void;
}) {
  return <CodeTestEditor test={test} onChange={onChange} onRemove={onRemove} />;
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
