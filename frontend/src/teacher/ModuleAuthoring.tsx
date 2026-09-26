import { useCallback, useEffect, useState } from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import type {
  CodeCheck,
  CodeExercise,
  CreateCodeCheckRequest,
  Module,
  TeacherModule,
  UpdateCodeCheckRequest,
  UpsertCodeExerciseRequest,
} from "../../../shared/types";

// The child CRUD endpoints return raw rows; refetching the aggregate after every
// mutation (reload) is the source of truth for this page.

export default function ModuleAuthoring() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [module, setModule] = useState<TeacherModule | null>(null);
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [questionPrompts, setQuestionPrompts] = useState<
    Record<string, string>
  >({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadModules = useCallback(async () => {
    const classroomId = user?.classroomId;
    if (!classroomId) return;
    try {
      const list = await api.listModules(classroomId);
      setModules(list);
      setSelectedId((prev) =>
        prev && list.some((m) => m.id === prev) ? prev : (list[0]?.id ?? ""),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load modules");
    }
  }, [user?.classroomId]);

  const reload = useCallback(async () => {
    if (!selectedId) {
      setModule(null);
      return;
    }
    try {
      setModule((await api.getModule(selectedId)) as TeacherModule);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load module");
    }
  }, [selectedId]);

  useEffect(() => {
    void loadModules();
  }, [loadModules]);
  useEffect(() => {
    void reload();
  }, [reload]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const mutateAndReload = (mutation: () => Promise<unknown>) =>
    run(async () => {
      await mutation();
      await reload();
    });

  const saveExercise = (questionId: string, body: UpsertCodeExerciseRequest) =>
    mutateAndReload(() => api.upsertExercise(questionId, body));
  const addCheck = (exerciseId: string, body: CreateCodeCheckRequest) =>
    mutateAndReload(() => api.createCheck(exerciseId, body));
  const saveCheck = (id: string, body: UpdateCodeCheckRequest) =>
    mutateAndReload(() => api.updateCheck(id, body));
  const removeCheck = (id: string) =>
    mutateAndReload(() => api.deleteCheck(id));

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p className="rounded bg-red-50 p-2 text-sm text-red-600">{error}</p>
      )}

      <section className="rounded border bg-white p-4">
        <h2 className="font-semibold">Modules</h2>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded border px-2 py-1 text-sm"
          >
            <option value="">Select a module…</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
          {!modules.length && (
            <span className="text-xs text-gray-400">no modules yet</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            placeholder="New module title"
            className="rounded border px-2 py-1 text-sm"
          />
          <button
            disabled={busy || !newModuleTitle.trim()}
            onClick={() =>
              void run(async () => {
                const created = await api.createModule({
                  title: newModuleTitle.trim(),
                });
                setNewModuleTitle("");
                await loadModules();
                setSelectedId(created.id);
              })
            }
            className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
          >
            Create module
          </button>
        </div>
      </section>

      {module && (
        <section className="rounded border bg-white p-4">
          <h2 className="font-semibold">Sections</h2>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={newSectionTitle}
              onChange={(e) => setNewSectionTitle(e.target.value)}
              placeholder="New section title"
              className="rounded border px-2 py-1 text-sm"
            />
            <button
              disabled={busy || !newSectionTitle.trim()}
              onClick={() =>
                void run(async () => {
                  await api.createSection(module.id, {
                    title: newSectionTitle.trim(),
                  });
                  setNewSectionTitle("");
                  await reload();
                })
              }
              className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
            >
              Add section
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-4">
            {!module.sections.length && (
              <p className="text-sm text-gray-500">
                No sections yet — create a section first.
              </p>
            )}
            {module.sections.map((section) => (
              <div key={section.id} className="rounded border p-3">
                <h3 className="font-medium">{section.title}</h3>

                <div className="mt-2 flex flex-col gap-4">
                  {!section.questions.length && (
                    <p className="text-xs text-gray-400">No questions yet.</p>
                  )}
                  {section.questions.map((q) => {
                    if (q.kind !== "code") {
                      return (
                        <p key={q.id} className="text-sm text-gray-500">
                          {q.prompt} ({q.kind})
                        </p>
                      );
                    }
                    const ex = q.codeExercise;
                    return (
                      <div key={q.id} className="rounded border bg-gray-50 p-3">
                        <p className="text-sm">{q.prompt}</p>
                        <ExerciseForm
                          exercise={ex}
                          busy={busy}
                          onSave={(body) => saveExercise(q.id, body)}
                        />
                        {ex && (
                          <ChecksEditor
                            checks={ex.checks}
                            busy={busy}
                            onAdd={(body) => addCheck(ex.id, body)}
                            onSave={saveCheck}
                            onDelete={removeCheck}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <input
                    value={questionPrompts[section.id] ?? ""}
                    onChange={(e) =>
                      setQuestionPrompts((prev) => ({
                        ...prev,
                        [section.id]: e.target.value,
                      }))
                    }
                    placeholder="New code question prompt"
                    className="rounded border px-2 py-1 text-sm"
                  />
                  <button
                    disabled={
                      busy || !(questionPrompts[section.id] ?? "").trim()
                    }
                    onClick={() =>
                      void run(async () => {
                        await api.createQuestion(section.id, {
                          prompt: (questionPrompts[section.id] ?? "").trim(),
                          kind: "code",
                        });
                        setQuestionPrompts((prev) => ({
                          ...prev,
                          [section.id]: "",
                        }));
                        await reload();
                      })
                    }
                    className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
                  >
                    Add code question
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function ExerciseForm({
  exercise,
  busy,
  onSave,
}: {
  exercise?: CodeExercise;
  busy: boolean;
  onSave: (body: UpsertCodeExerciseRequest) => Promise<void>;
}) {
  const [language, setLanguage] = useState(exercise?.language ?? "javascript");
  const [starterCode, setStarterCode] = useState(exercise?.starterCode ?? "");
  const [instructions, setInstructions] = useState(
    exercise?.instructions ?? "",
  );

  return (
    <div className="mt-3 flex flex-col gap-2 rounded border bg-white p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold uppercase text-gray-500">
          Exercise
        </span>
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="javascript">javascript</option>
          <option value="typescript">typescript</option>
        </select>
      </div>
      <textarea
        value={starterCode}
        onChange={(e) => setStarterCode(e.target.value)}
        placeholder="Starter code students begin from"
        rows={5}
        className="rounded border p-2 font-mono text-xs"
      />
      <textarea
        value={instructions}
        onChange={(e) => setInstructions(e.target.value)}
        placeholder="Instructions shown to students"
        rows={2}
        className="rounded border p-2 text-sm"
      />
      <button
        disabled={busy}
        onClick={() => void onSave({ language, starterCode, instructions })}
        className="self-start rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
      >
        {exercise ? "Save exercise" : "Create exercise"}
      </button>
    </div>
  );
}

function ChecksEditor({
  checks,
  busy,
  onAdd,
  onSave,
  onDelete,
}: {
  checks: CodeCheck[];
  busy: boolean;
  onAdd: (body: CreateCodeCheckRequest) => Promise<void>;
  onSave: (id: string, body: UpdateCodeCheckRequest) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [code, setCode] = useState("");

  return (
    <div className="mt-2 flex flex-col gap-2 rounded border bg-white p-3">
      <span className="text-xs font-semibold uppercase text-gray-500">
        Checks
      </span>
      <p className="text-xs text-gray-500">
        Check code = statements using expect(value).toBe(expected) or
        expect(value).toEqual(expected), e.g. expect(add(2, 3)).toBe(5);
      </p>
      {!checks.length && (
        <p className="text-xs text-gray-400">No checks yet — add one below.</p>
      )}
      {checks.map((check) => (
        <CheckEditor
          key={check.id}
          check={check}
          busy={busy}
          onSave={onSave}
          onDelete={onDelete}
        />
      ))}
      <div className="flex flex-col gap-2 rounded border border-dashed p-2">
        <span className="text-xs font-medium">Add check</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Check name, e.g. Adds positives"
          className="rounded border px-2 py-1 text-sm"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description, e.g. add(2, 3) returns 5"
          className="rounded border px-2 py-1 text-sm"
        />
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="expect(add(2, 3)).toBe(5);"
          rows={2}
          className="rounded border p-2 font-mono text-xs"
        />
        <button
          disabled={busy || !name.trim() || !description.trim() || !code.trim()}
          onClick={() =>
            void onAdd({
              name: name.trim(),
              description: description.trim(),
              code,
            }).then(() => {
              setName("");
              setDescription("");
              setCode("");
            })
          }
          className="self-start rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Add check
        </button>
      </div>
    </div>
  );
}

function CheckEditor({
  check,
  busy,
  onSave,
  onDelete,
}: {
  check: CodeCheck;
  busy: boolean;
  onSave: (id: string, body: UpdateCodeCheckRequest) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(check.name);
  const [description, setDescription] = useState(check.description);
  const [code, setCode] = useState(check.code);

  return (
    <div className="flex flex-col gap-2 rounded border p-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Check name"
        className="rounded border px-2 py-1 text-sm"
      />
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        className="rounded border px-2 py-1 text-sm"
      />
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="expect(add(2, 3)).toBe(5);"
        rows={2}
        className="rounded border p-2 font-mono text-xs"
      />
      <div className="flex gap-2">
        <button
          disabled={busy}
          onClick={() => void onSave(check.id, { name, description, code })}
          className="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Save
        </button>
        <button
          disabled={busy}
          onClick={() => void onDelete(check.id)}
          className="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
