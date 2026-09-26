import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import {
  Link,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { api, ApiClientError } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import Heading from "../ui/Heading.tsx";
import { ChevronLeftIcon } from "../ui/icons.tsx";
import { FOCUS_RING, INPUT, TINT } from "../ui/styles.ts";
import { useDialog } from "../ui/DialogContext.tsx";
import { onModuleDeleted } from "../socket.ts";
import AvailabilityCard from "./AvailabilityCard.tsx";
import CodeTestEditor from "./CodeTestEditor.tsx";
import TeacherCodeEditor from "./TeacherCodeEditor.tsx";
import { createBlankModuleDocument } from "./moduleBuilderDocument.ts";
import type {
  AiModuleSuggestion,
  AiCodeTestCandidate,
  ModuleAccess,
  ModuleBuilderDocument,
  QuestionKind,
  TeacherModule,
} from "../../../shared/types";

const RichTextEditor = lazy(() => import("./RichTextEditor.tsx"));

const id = () => crypto.randomUUID();
type BuilderItem = ModuleBuilderDocument["sections"][number]["items"][number];
type BuilderQuestion = Extract<BuilderItem, { type: "question" }>;
type Notice = { message: string; tone: "success" | "error" };

const questionLabel: Record<QuestionKind, string> = {
  mcq: "Multiple choice",
  short: "Short answer",
  long: "Long answer",
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
              checks: item.checks?.map((check) => ({ ...check, id: id() })),
              tests: item.tests?.map((test) => ({ ...test, id: id() })),
            },
      ),
    })),
  };
}

export default function ModuleBuilder() {
  const { id: moduleId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const classPath = `/teacher/class/${user?.classroomId ?? ""}`;
  const [searchParams] = useSearchParams();
  const routeState = location.state as {
    plannerDocument?: ModuleBuilderDocument;
    sourceLessonPlanId?: string;
    plannerWarning?: string;
    fromLessonPlan?: boolean;
  } | null;
  const plannerDocument = routeState?.plannerDocument;
  const sourceLessonPlanId = routeState?.sourceLessonPlanId;
  const [document, setDocument] = useState<ModuleBuilderDocument>(
    () => (!moduleId && plannerDocument) || createBlankModuleDocument(),
  );
  const [revision, setRevision] = useState(0);
  const [access, setAccess] = useState<ModuleAccess>("anytime");
  const [loading, setLoading] = useState(Boolean(moduleId));
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(() =>
    routeState?.plannerWarning
      ? { message: routeState.plannerWarning, tone: "error" }
      : null,
  );
  const [selected, setSelected] = useState<string | undefined>();
  const [assistantOpen, setAssistantOpen] = useState(false);
  const { confirm, toast } = useDialog();

  useEffect(() => {
    if (!moduleId) return;
    api
      .getModule(moduleId)
      .then((module) => {
        const teacher = module as TeacherModule;
        setDocument(documentFrom(teacher));
        setRevision(teacher.revision);
        setAccess(teacher.access);
        const questionId = searchParams.get("questionId");
        if (questionId) setSelected(questionId);
      })
      .catch((error) =>
        setNotice({
          message:
            error instanceof Error ? error.message : "Could not load module",
          tone: "error",
        }),
      )
      .finally(() => setLoading(false));
  }, [moduleId, searchParams]);

  useEffect(() => {
    if (!selected) return;
    window.document.getElementById(`lesson-item-${selected}`)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [selected]);

  useEffect(() => {
    if (!moduleId) return;
    return onModuleDeleted((event) => {
      if (event.moduleId === moduleId) {
        setNotice({ message: "This module was deleted.", tone: "success" });
        navigate(classPath, { replace: true });
      }
    });
  }, [moduleId, navigate, classPath]);

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
      let linkError: string | null = null;
      if (!moduleId && sourceLessonPlanId) {
        try {
          await api.linkTeacherLessonPlanModule(sourceLessonPlanId, result.module.id);
        } catch (error) {
          linkError = error instanceof Error ? error.message : "The plan could not be linked";
        }
      }
      setDocument(documentFrom(result.module));
      setRevision(result.module.revision);
      if (!moduleId)
        navigate(`/teacher/modules/${result.module.id}`, { replace: true });
      setNotice({
        message: linkError
          ? `${result.module.status === "published" ? "Module published" : "Draft saved"}, but it could not be linked to its planned lesson: ${linkError}`
          : result.module.status === "published"
            ? "Published changes are live for students."
            : sourceLessonPlanId
              ? "Draft saved and linked to its planned lesson. Students cannot see it until you publish it."
              : "Draft saved. Students cannot see it until you publish it.",
        tone: linkError ? "error" : "success",
      });
      toast(linkError ? "Module saved, but the plan link failed." : result.module.status === "published" ? "Module published." : sourceLessonPlanId ? "Draft saved and linked." : "Draft saved.");
    } catch (error) {
      setNotice({
        message:
          error instanceof ApiClientError && error.status === 409
            ? "This module changed elsewhere. Reload before saving."
            : error instanceof Error
              ? error.message
              : "Could not save",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  async function removeModule() {
    if (
      !moduleId ||
      !(await confirm({
        title: "Delete module?",
        message:
          "Permanently delete this module and all of its lesson content?",
        confirmLabel: "Delete module",
      }))
    )
      return;
    setSaving(true);
    setNotice(null);
    try {
      await api.deleteModule(moduleId);
      toast("Module deleted.");
      navigate(classPath, { replace: true });
    } catch (error) {
      setNotice({
        message:
          error instanceof Error ? error.message : "Could not delete module",
        tone: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="m-0 text-muted">Loading module…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Link
            className={`inline-flex h-9 self-start items-center gap-1.5 rounded-[9px] border border-border bg-surface pr-3 pl-2 text-[13px]! font-semibold! text-ink hover:bg-surface-soft ${FOCUS_RING}`}
            to={classPath}
          >
            <ChevronLeftIcon className="size-4" />
            Back to classroom
          </Link>
          <Heading as="h1" variant="title">
            {routeState?.fromLessonPlan ? "Review student module" : "Build a lesson"}
          </Heading>
          <p className="m-0 text-sm text-muted">
            {routeState?.fromLessonPlan
              ? "Built from your saved lesson plan. Review the student-facing content, then publish when it is ready. "
              : ""}
            {itemCount} lesson items ·{" "}
            {document.status === "draft"
              ? "Draft — hidden from students"
              : "Published"}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 lg:gap-5">
          {document.status === "draft" && (
            <Button
              variant="default"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save draft"}
            </Button>
          )}
          {document.status === "published" ? (
            <Button
              variant="primary"
              disabled={saving}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save published changes"}
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
          {(moduleId || document.status === "published") && (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-[9px] border border-border bg-surface px-3 py-2 text-sm! font-semibold! text-muted transition hover:border-accent/60 hover:text-ink [&::-webkit-details-marker]:hidden">
                More actions
              </summary>
              <div className="absolute right-0 z-10 mt-2 flex w-52 flex-col gap-2 rounded-xl border border-border bg-surface p-3 shadow-lg">
                {document.status === "published" && (
                  <Button
                    size="sm"
                    disabled={saving}
                    onClick={() => void save("draft")}
                  >
                    Unpublish to draft
                  </Button>
                )}
                {moduleId && (
                  <Button
                    size="sm"
                    variant="peach"
                    disabled={saving}
                    onClick={() => void removeModule()}
                  >
                    Delete module
                  </Button>
                )}
              </div>
            </details>
          )}
        </div>
      </div>

      {notice && (
        <p
          className={`m-0 rounded-xl px-4 py-3 text-sm ${notice.tone === "error" ? TINT.peach : TINT.mint}`}
          role={notice.tone === "error" ? "alert" : "status"}
        >
          {notice.message}
        </p>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Card title="Module details" bodyClassName="flex flex-col gap-4 p-5">
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
            <Suspense
              fallback={
                <p className="m-0 text-sm text-muted">Loading editor…</p>
              }
            >
              <RichTextEditor
                label="Introduction"
                value={document.content}
                onChange={(content) => change((old) => ({ ...old, content }))}
                placeholder="What will students learn in this module?"
              />
            </Suspense>
          </Card>

          <AvailabilityCard
            key={moduleId ?? "new"}
            moduleId={moduleId}
            access={access}
          />

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

        <aside aria-label="Writing assistant" className="min-w-0">
          <div className="lg:hidden">
            <Button
              className="w-full justify-between"
              onClick={() => setAssistantOpen((open) => !open)}
              aria-expanded={assistantOpen}
              aria-controls="builder-writing-assistant"
            >
              Plan with AI
              <span aria-hidden="true">{assistantOpen ? "−" : "+"}</span>
            </Button>
          </div>
          <div
            id="builder-writing-assistant"
            className={`${assistantOpen ? "mt-4 block" : "hidden"} lg:mt-0 lg:block lg:sticky lg:top-24 lg:h-[calc(100dvh-7rem)]`}
          >
            <WritingAssistant
              document={document}
              selectedItemId={selected}
              onApply={(suggestion) => {
                setDocument(withFreshIds(suggestion));
                setSelected(undefined);
                setNotice({
                  message:
                    "AI draft applied locally. Review it, then save when you are ready.",
                  tone: "success",
                });
              }}
              onUndo={(previous) => {
                setDocument(previous);
                setSelected(undefined);
                setNotice({
                  message: "AI draft change undone locally.",
                  tone: "success",
                });
              }}
            />
          </div>
        </aside>
      </div>
    </div>
  );
}

/** Keeps assistant typing local so it does not re-render every lesson editor. */
function WritingAssistant({
  document,
  selectedItemId,
  onApply,
  onUndo,
}: {
  document: ModuleBuilderDocument;
  selectedItemId?: string;
  onApply: (document: ModuleBuilderDocument) => void;
  onUndo: (document: ModuleBuilderDocument) => void;
}) {
  const [idea, setIdea] = useState("");
  const [askingAi, setAskingAi] = useState(false);
  const [result, setResult] = useState<AiModuleSuggestion | null>(null);
  const [undo, setUndo] = useState<ModuleBuilderDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const presets = selectedItemId
    ? [
        "Make this clearer for beginners.",
        "Add a quick check for understanding.",
        "Suggest a practical code exercise.",
      ]
    : [
        "Create a complete 20-minute beginner lesson.",
        "Add practice questions and an exit check.",
        "Make this lesson more hands-on.",
      ];

  async function askAi() {
    if (!idea.trim() || askingAi) return;
    setAskingAi(true);
    setError(null);
    setResult(null);
    try {
      const result = await api.aiModuleSuggestions({
        request: idea,
        document,
        selectedItemId,
      });
      const suggestion = result.suggestions[0] ?? null;
      setResult(suggestion);
      if (!suggestion)
        setError(
          result.warning ??
            "The assistant could not make a usable suggestion. Please try again.",
        );
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not get suggestions",
      );
    } finally {
      setAskingAi(false);
    }
  }

  function accept(suggestion: AiModuleSuggestion) {
    if (!suggestion.document) return;
    setUndo(document);
    onApply(suggestion.document);
    setResult(null);
  }

  return (
    <Card
      title="Writing assistant"
      className="flex h-full min-h-0 flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5"
    >
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-soft p-3">
        <span className="text-xs font-semibold text-muted">
          AI DRAFT WORKSPACE
        </span>
        <p className="m-0 text-xs leading-relaxed text-muted">
          {selectedItemId
            ? "Context: the selected lesson item and the full in-memory module draft."
            : "Context: the full in-memory module draft."}
        </p>
        <p className="m-0 text-xs leading-relaxed text-muted">
          Nothing is saved or published when you ask the assistant.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold text-muted">
          PROMPT STARTERS
        </span>
        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button key={preset} size="sm" onClick={() => setIdea(preset)}>
              {preset}
            </Button>
          ))}
        </div>
      </div>
      <label className="flex flex-col gap-2 text-sm text-muted">
        What would you like help with?
        <textarea
          className={`${INPUT} min-h-28 py-2.5`}
          value={idea}
          onChange={(event) => setIdea(event.target.value)}
          placeholder={
            selectedItemId
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
        {askingAi ? "Drafting…" : "Generate one draft"}
      </Button>
      {error && (
        <p
          className={`m-0 rounded-xl px-3 py-2 text-sm ${TINT.peach}`}
          role="alert"
        >
          {error}
        </p>
      )}
      {result && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-3 text-sm">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-muted">
              RESULT · REVIEW BEFORE APPLYING
            </span>
            <span className="font-medium text-ink">{result.label}</span>
          </div>
          <p className="m-0 whitespace-pre-wrap text-muted">{result.reply}</p>
          {result.document && (
            <>
              <p
                className={`m-0 rounded-lg px-3 py-2 text-xs leading-relaxed ${TINT.peach}`}
              >
                Applying replaces the full in-memory lesson draft. It does not
                save or publish; review the replacement and save explicitly.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="primary"
                  onClick={() => accept(result)}
                >
                  Apply replacement draft
                </Button>
                <Button size="sm" onClick={() => setResult(null)}>
                  Discard result
                </Button>
              </div>
            </>
          )}
        </div>
      )}
      {undo && (
        <div className="flex flex-col gap-2 rounded-xl border border-border p-3">
          <p className="m-0 text-xs text-muted">
            A local AI replacement is ready to undo. Saved work is unchanged
            until you save.
          </p>
          <Button
            size="sm"
            className="self-start"
            onClick={() => {
              onUndo(undo);
              setUndo(null);
            }}
          >
            Undo replacement
          </Button>
        </div>
      )}
    </Card>
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
  const [newItemType, setNewItemType] = useState<"reading" | QuestionKind>(
    "reading",
  );
  const addSelectedItem = () =>
    onAddItem(
      newItemType === "reading"
        ? { id: id(), type: "block", blockType: "markdown", content: "" }
        : newQuestion(newItemType),
    );
  return (
    <Card
      title={`Section ${String(sectionIndex + 1).padStart(2, "0")}`}
      action={
        sectionCount > 1 ? (
          <Button
            size="sm"
            variant="peach"
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

      <fieldset className="m-0 flex flex-col gap-3 border-0 border-t border-border pt-4 p-0">
        <div className="flex flex-col gap-1">
          <legend className="text-sm font-semibold text-ink">
            Add content
          </legend>
          <span className="text-xs text-muted">
            Choose the next item in this section’s learning flow.
          </span>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex min-w-52 flex-1 flex-col gap-1.5 text-xs text-muted">
            Content type
            <select
              className={`${INPUT} h-10`}
              value={newItemType}
              onChange={(event) =>
                setNewItemType(event.target.value as "reading" | QuestionKind)
              }
            >
              <option value="reading">Reading / explanation</option>
              <option value="mcq">Multiple choice question</option>
              <option value="short">Short-answer question</option>
              <option value="code">Code exercise</option>
              <option value="math">Math question</option>
            </select>
          </label>
          <Button variant="primary" onClick={addSelectedItem}>
            Add item
          </Button>
        </div>
      </fieldset>
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
      id={`lesson-item-${item.id}`}
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
        <div className="flex items-center gap-1 rounded-lg border border-border bg-surface-soft p-1">
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
            variant="peach"
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
            <option value="long">Long answer</option>
            <option value="code">Code exercise</option>
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          Prompt (Markdown supported)
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

function ReadingEditor({
  item,
  onUpdate,
}: {
  item: Extract<BuilderItem, { type: "block" }>;
  onUpdate: (patch: (item: BuilderItem) => BuilderItem) => void;
}) {
  const content =
    typeof item.content === "string"
      ? item.content
      : JSON.stringify(item.content, null, 2);
  return (
    <Suspense
      fallback={<p className="m-0 text-sm text-muted">Loading editor…</p>}
    >
      <RichTextEditor
        label="Reading content"
        value={content}
        placeholder="Explain the idea, then add an example…"
        onChange={(content) =>
          onUpdate((current) =>
            current.type === "block" ? { ...current, content } : current,
          )
        }
      />
    </Suspense>
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
  const { confirm } = useDialog();
  const checks = item.checks ?? [];
  const [testRequest, setTestRequest] = useState("");
  const [candidates, setCandidates] = useState<AiCodeTestCandidate[]>([]);
  const [generating, setGenerating] = useState(false);
  const [candidateNotice, setCandidateNotice] = useState<string | null>(null);
  const language = item.language ?? "javascript";
  const supportedLanguage = isSupportedLanguage(language)
    ? language
    : undefined;
  const applyTemplate = async () => {
    if (!supportedLanguage) return;
    if (
      (item.starterCode ?? "").trim() &&
      !(await confirm({
        title: "Replace starter code?",
        message:
          "Replace the current starter code with this language template?",
        confirmLabel: "Replace",
      }))
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
  const removeCandidate = (index: number) => {
    setCandidates((current) =>
      current.filter((_, currentIndex) => currentIndex !== index),
    );
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
            <Button size="sm" onClick={() => void applyTemplate()}>
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
                    removeCandidate(index);
                  }}
                  onDismiss={() => removeCandidate(index)}
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
