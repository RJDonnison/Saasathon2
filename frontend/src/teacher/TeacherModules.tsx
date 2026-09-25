import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import type {
  Module,
  TeacherModule,
  TeacherQuestion,
} from "../../../shared/types";

const input = "w-full rounded border border-gray-300 px-3 py-2 text-sm";
const button =
  "rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50";

export default function TeacherModules() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [selected, setSelected] = useState<TeacherModule | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const refreshList = () =>
    user &&
    api
      .listModules(user.classroomId)
      .then(setModules)
      .catch((e: Error) => setError(e.message));
  const open = (id: string) =>
    api
      .getTeacherModule(id)
      .then(setSelected)
      .catch((e: Error) => setError(e.message));
  useEffect(() => {
    refreshList();
  }, [user]);
  const save = async (fields: Partial<Module>) => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await api.updateModule(selected.id, fields);
      await open(selected.id);
      refreshList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const create = async () => {
    setSaving(true);
    setError("");
    try {
      const module = await api.createModule({ title: "Untitled module" });
      refreshList();
      await open(module.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const addSection = async () => {
    if (!selected) return;
    await api.createSection(selected.id, { title: "New section" });
    await open(selected.id);
  };
  const addBlock = async (sectionId: string, type: string) => {
    await api.createBlock(sectionId, {
      type,
      content:
        type === "code"
          ? "// Explain this code"
          : "Write learning content here.",
    });
    await open(selected!.id);
  };
  const addQuestion = async (
    sectionId: string,
    kind: "mcq" | "short" | "code",
  ) => {
    await api.createQuestion(sectionId, { kind, prompt: "New question" });
    await open(selected!.id);
  };
  const move = async (
    update: (id: string, body: { position: number }) => Promise<unknown>,
    id: string,
    position: number,
  ) => {
    if (!selected) return;
    setSaving(true);
    setError("");
    try {
      await update(id, { position });
      await open(selected.id);
      refreshList();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async () => {
    if (
      selected &&
      confirm(
        "Delete this module? This immediately and permanently cascades to its sections, questions, student progress, submissions, and comments.",
      )
    ) {
      await api.deleteModule(selected.id);
      setSelected(null);
      refreshList();
    }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-[18rem_1fr]">
      <aside className="flex flex-col gap-3 rounded border bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Modules</h2>
          <button
            className={button}
            disabled={saving}
            onClick={() => void create()}
          >
            New
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Publishing makes a module immediately visible to students.
        </p>
        {modules.map((m, moduleIndex) => (
          <div
            key={m.id}
            className={`flex items-center gap-2 rounded border p-3 text-sm ${selected?.id === m.id ? "border-blue-500 bg-blue-50" : ""}`}
          >
            <button
              onClick={() => void open(m.id)}
              className="min-w-0 flex-1 text-left"
            >
              <span className="block font-medium">{m.title}</span>
              <span className="text-xs text-gray-500">{m.state}</span>
            </button>
            <PositionControls
              itemLabel={`module ${m.title}`}
              index={moduleIndex}
              count={modules.length}
              saving={saving}
              onMove={(direction) =>
                void move(
                  api.updateModule,
                  m.id,
                  modules[moduleIndex + direction].position,
                )
              }
            />
          </div>
        ))}
      </aside>
      <section className="flex flex-col gap-5 rounded border bg-white p-5">
        {error && (
          <p className="rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}
        {!selected ? (
          <p className="text-gray-600">Select a module or create a draft.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Module authoring</h2>
                <p className="text-xs text-gray-500">
                  Changes save when you use Save. Use the arrow controls to
                  reorder authored items.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className={button}
                  onClick={() =>
                    void save({
                      state: selected.state === "draft" ? "published" : "draft",
                    })
                  }
                >
                  {selected.state === "draft"
                    ? "Publish now"
                    : "Return to draft"}
                </button>
                <button
                  className="rounded border border-red-300 px-3 py-2 text-sm text-red-700"
                  onClick={() => void remove()}
                >
                  Delete
                </button>
              </div>
            </div>
            <ModuleFields module={selected} saving={saving} onSave={save} />
            <Preview module={selected} />
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Sections</h3>
              <button className={button} onClick={() => void addSection()}>
                Add section
              </button>
            </div>
            {selected.sections.map((section, sectionIndex) => (
              <div
                key={section.id}
                className="flex flex-col gap-3 rounded border p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <h4 className="font-medium">
                    {section.position + 1}. {section.title}
                  </h4>
                  <PositionControls
                    itemLabel={`section ${section.title}`}
                    index={sectionIndex}
                    count={selected.sections.length}
                    saving={saving}
                    onMove={(direction) =>
                      void move(
                        api.updateSection,
                        section.id,
                        selected.sections[sectionIndex + direction].position,
                      )
                    }
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => void addBlock(section.id, "text")}
                  >
                    + Text block
                  </button>
                  <button
                    className="rounded border px-2 py-1 text-xs"
                    onClick={() => void addBlock(section.id, "code")}
                  >
                    + Code block
                  </button>
                  {(["mcq", "short", "code"] as const).map((k) => (
                    <button
                      key={k}
                      className="rounded border px-2 py-1 text-xs"
                      onClick={() => void addQuestion(section.id, k)}
                    >
                      + {k} question
                    </button>
                  ))}
                </div>
                {section.blocks.map((b, blockIndex) => (
                  <div key={b.id} className="rounded bg-gray-50 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <p>
                        <b>{b.type} block:</b>{" "}
                        {typeof b.content === "string"
                          ? b.content
                          : JSON.stringify(b.content)}
                      </p>
                      <PositionControls
                        itemLabel={`${b.type} block`}
                        index={blockIndex}
                        count={section.blocks.length}
                        saving={saving}
                        onMove={(direction) =>
                          void move(
                            api.updateBlock,
                            b.id,
                            section.blocks[blockIndex + direction].position,
                          )
                        }
                      />
                    </div>
                  </div>
                ))}
                {section.questions.map((q, questionIndex) => (
                  <QuestionSummary
                    key={q.id}
                    question={q}
                    index={questionIndex}
                    count={section.questions.length}
                    saving={saving}
                    onMove={(direction) =>
                      void move(
                        api.updateQuestion,
                        q.id,
                        section.questions[questionIndex + direction].position,
                      )
                    }
                    move={move}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </section>
    </div>
  );
}

function ModuleFields({
  module,
  saving,
  onSave,
}: {
  module: TeacherModule;
  saving: boolean;
  onSave: (v: Partial<Module>) => Promise<void>;
}) {
  const [title, setTitle] = useState(module.title);
  const [description, setDescription] = useState(module.description);
  const [overview, setOverview] = useState(module.overview);
  useEffect(() => {
    setTitle(module.title);
    setDescription(module.description);
    setOverview(module.overview);
  }, [module]);
  return (
    <div className="grid gap-3">
      <input
        className={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        aria-label="Module title"
      />
      <input
        className={input}
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Short description"
      />
      <textarea
        className={input}
        value={overview}
        onChange={(e) => setOverview(e.target.value)}
        placeholder="Student overview"
      />
      <button
        className={`${button} w-fit`}
        disabled={saving}
        onClick={() => void onSave({ title, description, overview })}
      >
        {saving ? "Saving…" : "Save details"}
      </button>
    </div>
  );
}
function PositionControls({
  itemLabel,
  index,
  count,
  saving,
  onMove,
}: {
  itemLabel: string;
  index: number;
  count: number;
  saving: boolean;
  onMove: (direction: -1 | 1) => void;
}) {
  const control =
    "rounded border px-2 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex shrink-0 gap-1">
      <button
        className={control}
        type="button"
        aria-label={`Move ${itemLabel} up`}
        disabled={saving || index === 0}
        onClick={() => onMove(-1)}
      >
        Up
      </button>
      <button
        className={control}
        type="button"
        aria-label={`Move ${itemLabel} down`}
        disabled={saving || index === count - 1}
        onClick={() => onMove(1)}
      >
        Down
      </button>
    </div>
  );
}

function QuestionSummary({
  question,
  index,
  count,
  saving,
  onMove,
  move,
}: {
  question: TeacherQuestion;
  index: number;
  count: number;
  saving: boolean;
  onMove: (direction: -1 | 1) => void;
  move: (
    update: (id: string, body: { position: number }) => Promise<unknown>,
    id: string,
    position: number,
  ) => Promise<void>;
}) {
  return (
    <div className="rounded bg-gray-50 p-3 text-sm">
      <div className="flex items-center justify-between gap-3">
        <p>
          <b>{question.kind.toUpperCase()}:</b> {question.prompt}
        </p>
        <PositionControls
          itemLabel={`${question.kind} question`}
          index={index}
          count={count}
          saving={saving}
          onMove={onMove}
        />
      </div>
      {question.kind === "mcq" && (
        <OrderedChildren
          label="option"
          items={question.options}
          saving={saving}
          update={api.updateOption}
          move={move}
          render={(option) => option.text}
        />
      )}
      {question.codeExercise && (
        <div className="mt-2 flex flex-col gap-2 text-xs text-gray-600">
          <p>
            {question.codeExercise.language}:{" "}
            {question.codeExercise.instructions}
          </p>
          <OrderedChildren
            label="hint"
            items={question.codeExercise.hints}
            saving={saving}
            update={api.updateHint}
            move={move}
            render={(hint) => hint.text}
          />
          <OrderedChildren
            label="reference answer"
            items={question.codeExercise.referenceAnswers}
            saving={saving}
            update={api.updateReference}
            move={move}
            render={(reference) => reference.title}
          />
          <OrderedChildren
            label="code check"
            items={question.codeExercise.checks}
            saving={saving}
            update={api.updateCheck}
            move={move}
            render={(check) => check.name}
          />
        </div>
      )}
    </div>
  );
}
function OrderedChildren<T extends { id: string; position: number }>({
  label,
  items,
  saving,
  update,
  move,
  render,
}: {
  label: string;
  items: T[];
  saving: boolean;
  update: (id: string, body: { position: number }) => Promise<unknown>;
  move: (
    update: (id: string, body: { position: number }) => Promise<unknown>,
    id: string,
    position: number,
  ) => Promise<void>;
  render: (item: T) => string;
}) {
  return (
    <div className="flex flex-col gap-1">
      {items.map((item, itemIndex) => (
        <div key={item.id} className="flex items-center justify-between gap-3">
          <span>
            {label}: {render(item)}
          </span>
          <PositionControls
            itemLabel={label}
            index={itemIndex}
            count={items.length}
            saving={saving}
            onMove={(direction) =>
              void move(update, item.id, items[itemIndex + direction].position)
            }
          />
        </div>
      ))}
    </div>
  );
}
function Preview({ module }: { module: TeacherModule }) {
  return (
    <details className="rounded border border-blue-200 bg-blue-50 p-4">
      <summary className="cursor-pointer font-medium">
        Student preview (read-only)
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <h3 className="text-lg font-semibold">{module.title}</h3>
        <p>{module.overview || module.description}</p>
        {module.sections.map((s) => (
          <div key={s.id}>
            <h4 className="font-medium">{s.title}</h4>
            {s.blocks.map((b) => (
              <p key={b.id} className="text-sm">
                {typeof b.content === "string"
                  ? b.content
                  : JSON.stringify(b.content)}
              </p>
            ))}
            {s.questions.map((q) => (
              <p key={q.id} className="text-sm">
                {q.prompt}
              </p>
            ))}
          </div>
        ))}
      </div>
    </details>
  );
}
