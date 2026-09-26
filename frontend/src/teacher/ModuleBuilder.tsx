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
  TeacherModule,
} from "../../../shared/types";

const id = () => crypto.randomUUID();
const blank = (): ModuleBuilderDocument => ({
  title: "Untitled module",
  content: "",
  status: "draft",
  sections: [{ id: id(), title: "Section 1", items: [] }],
});
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
        items: section.items.flatMap<
          ModuleBuilderDocument["sections"][number]["items"][number]
        >((item) => {
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
              options: question.options.map((option) => option.text),
              language: question.codeExercise?.language,
              starterCode: question.codeExercise?.starterCode,
              instructions: question.codeExercise?.instructions,
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
      .then((m) => {
        const teacher = m as TeacherModule;
        setDocument(documentFrom(teacher));
        setRevision(teacher.revision);
      })
      .catch((e) =>
        setNotice(e instanceof Error ? e.message : "Could not load module"),
      )
      .finally(() => setLoading(false));
  }, [moduleId]);
  const itemCount = useMemo(
    () =>
      document.sections.reduce(
        (count, section) => count + section.items.length,
        0,
      ),
    [document],
  );
  function change(fn: (old: ModuleBuilderDocument) => ModuleBuilderDocument) {
    setDocument(fn);
  }
  function move(itemId: string, destinationSectionId: string) {
    change((old) => {
      const item = old.sections
        .flatMap((s) => s.items)
        .find((i) => i.id === itemId);
      if (!item) return old;
      return {
        ...old,
        sections: old.sections.map((s) => ({
          ...s,
          items:
            s.id === destinationSectionId
              ? [...s.items.filter((i) => i.id !== itemId), item]
              : s.items.filter((i) => i.id !== itemId),
        })),
      };
    });
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
    } catch (e) {
      setNotice(
        e instanceof ApiClientError && e.status === 409
          ? "This module changed elsewhere. Reload before saving."
          : e instanceof Error
            ? e.message
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
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not get suggestions");
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
            {itemCount} ordered items ·{" "}
            {document.status === "draft"
              ? "Draft — hidden from students"
              : "Published"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
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
            {saving ? "Saving…" : "Save draft"}
          </Button>
          <Button
            variant="primary"
            disabled={saving}
            onClick={() => void save(true)}
          >
            Publish
          </Button>
        </div>
      </div>
      {notice && (
        <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.mint}`}>
          {notice}
        </p>
      )}
      <Card title="Module details" bodyClassName="flex flex-col gap-4 p-5">
        <label className="flex flex-col gap-2 text-sm text-muted">
          Module title
          <input
            className={`${INPUT} h-11`}
            value={document.title}
            onChange={(e) => change((d) => ({ ...d, title: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-muted">
          Introduction
          <textarea
            className={`${INPUT} min-h-24`}
            value={document.content}
            onChange={(e) => change((d) => ({ ...d, content: e.target.value }))}
          />
        </label>
      </Card>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-5">
          {document.sections.map((section, sectionIndex) => (
            <Card
              key={section.id}
              title={`Section ${sectionIndex + 1}`}
              bodyClassName="flex flex-col gap-4 p-5"
            >
              <input
                className={`${INPUT} h-10`}
                aria-label="Section title"
                value={section.title}
                onChange={(e) =>
                  change((d) => ({
                    ...d,
                    sections: d.sections.map((s) =>
                      s.id === section.id ? { ...s, title: e.target.value } : s,
                    ),
                  }))
                }
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) =>
                  move(e.dataTransfer.getData("text/plain"), section.id)
                }
              />
              <div className="flex flex-col gap-2">
                {section.items.map((item) => (
                  <div
                    key={item.id}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData("text/plain", item.id)
                    }
                    onClick={() => setSelected(item.id)}
                    className={`flex cursor-grab flex-col gap-2 rounded-xl border p-3 ${selected === item.id ? "border-accent bg-surface-soft" : "border-border bg-surface"}`}
                  >
                    {item.type === "block" ? (
                      <textarea
                        className={`${INPUT} min-h-20`}
                        value={
                          typeof item.content === "string"
                            ? item.content
                            : JSON.stringify(item.content)
                        }
                        onChange={(e) =>
                          change((d) => ({
                            ...d,
                            sections: d.sections.map((s) => ({
                              ...s,
                              items: s.items.map((i) =>
                                i.id === item.id && i.type === "block"
                                  ? { ...i, content: e.target.value }
                                  : i,
                              ),
                            })),
                          }))
                        }
                      />
                    ) : (
                      <>
                        <select
                          className={`${INPUT} h-9`}
                          value={item.kind}
                          onChange={(e) =>
                            change((d) => ({
                              ...d,
                              sections: d.sections.map((s) => ({
                                ...s,
                                items: s.items.map((i) =>
                                  i.id === item.id && i.type === "question"
                                    ? {
                                        ...i,
                                        kind: e.target.value as typeof i.kind,
                                      }
                                    : i,
                                ),
                              })),
                            }))
                          }
                        >
                          <option value="mcq">Multiple choice</option>
                          <option value="short">Short answer</option>
                          <option value="code">Code</option>
                        </select>
                        <textarea
                          className={`${INPUT} min-h-16`}
                          value={item.prompt}
                          onChange={(e) =>
                            change((d) => ({
                              ...d,
                              sections: d.sections.map((s) => ({
                                ...s,
                                items: s.items.map((i) =>
                                  i.id === item.id && i.type === "question"
                                    ? { ...i, prompt: e.target.value }
                                    : i,
                                ),
                              })),
                            }))
                          }
                          placeholder="Question prompt"
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="default"
                  onClick={() =>
                    change((d) => ({
                      ...d,
                      sections: d.sections.map((s) =>
                        s.id === section.id
                          ? {
                              ...s,
                              items: [
                                ...s.items,
                                {
                                  id: id(),
                                  type: "block",
                                  blockType: "markdown",
                                  content: "",
                                },
                              ],
                            }
                          : s,
                      ),
                    }))
                  }
                >
                  + Reading
                </Button>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() =>
                    change((d) => ({
                      ...d,
                      sections: d.sections.map((s) =>
                        s.id === section.id
                          ? {
                              ...s,
                              items: [
                                ...s.items,
                                {
                                  id: id(),
                                  type: "question",
                                  prompt: "",
                                  kind: "short",
                                  answerKey: null,
                                  options: [],
                                },
                              ],
                            }
                          : s,
                      ),
                    }))
                  }
                >
                  + Question
                </Button>
              </div>
            </Card>
          ))}
        </div>
        <aside className="flex flex-col gap-4">
          <Card
            title="AI suggestions"
            eyebrow="Teacher only"
            bodyClassName="flex flex-col gap-3 p-5"
          >
            <textarea
              className={`${INPUT} min-h-24`}
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder={
                selected ? "Improve selected item…" : "Improve this module…"
              }
            />
            <Button
              variant="primary"
              disabled={!moduleId}
              onClick={() => void askAi()}
            >
              Suggest
            </Button>
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex flex-col gap-2 rounded-xl bg-surface-soft p-3 text-sm"
              >
                <span>{suggestion.label}</span>
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => accept(suggestion.patch)}
                >
                  Accept
                </Button>
              </div>
            ))}
            {undo && (
              <Button
                size="sm"
                variant="default"
                onClick={() => {
                  setDocument(undo);
                  setUndo(null);
                }}
              >
                Undo accepted suggestion
              </Button>
            )}
          </Card>
          <Button
            variant="default"
            onClick={() =>
              change((d) => ({
                ...d,
                sections: [
                  ...d.sections,
                  {
                    id: id(),
                    title: `Section ${d.sections.length + 1}`,
                    items: [],
                  },
                ],
              }))
            }
          >
            + Add section
          </Button>
        </aside>
      </div>
    </div>
  );
}
