import { useEffect, useMemo, useState } from "react";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import { INPUT, TINT } from "../ui/styles.ts";
import CodeTestEditor, { type EditableCodeTest } from "./CodeTestEditor.tsx";
import type { CodeTest, Module, TeacherModule } from "../../../shared/types";

export default function CodeTestPanel({ modules }: { modules: Module[] }) {
  const [moduleId, setModuleId] = useState("");
  const [module, setModule] = useState<TeacherModule | null>(null);
  const [exerciseId, setExerciseId] = useState("");
  const [functionName, setFunctionName] = useState("");
  const [testDraft, setTestDraft] = useState<EditableCodeTest>({
    name: "Check 1",
    args: [],
    expected: null,
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleId && modules[0]) setModuleId(modules[0].id);
  }, [moduleId, modules]);
  useEffect(() => {
    if (!moduleId) return;
    setLoading(true);
    setError(null);
    api
      .getModule(moduleId)
      .then((value) => setModule(value as TeacherModule))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not load exercises",
        ),
      )
      .finally(() => setLoading(false));
  }, [moduleId]);
  const exercises = useMemo(
    () =>
      module?.sections.flatMap((section) =>
        section.questions.flatMap((question) =>
          question.codeExercise
            ? [{ exercise: question.codeExercise, prompt: question.prompt }]
            : [],
        ),
      ) ?? [],
    [module],
  );
  const selected =
    exercises.find((item) => item.exercise.id === exerciseId) ?? exercises[0];
  useEffect(() => {
    if (selected && selected.exercise.id !== exerciseId)
      setExerciseId(selected.exercise.id);
  }, [exerciseId, selected]);
  useEffect(() => {
    if (selected) setFunctionName(selected.exercise.functionName);
  }, [selected?.exercise.id]);
  const refresh = async () => {
    if (moduleId) setModule((await api.getModule(moduleId)) as TeacherModule);
  };
  const saveFunction = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateExercise(selected.exercise.id, { functionName });
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save function name",
      );
    } finally {
      setSaving(false);
    }
  };
  const saveTest = async () => {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        name: testDraft.name,
        args: testDraft.args,
        expected: testDraft.expected,
      };
      if (editingId) await api.updateCodeTest(editingId, body);
      else await api.createCodeTest(selected.exercise.id, body);
      setEditingId(null);
      await refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save this check",
      );
    } finally {
      setSaving(false);
    }
  };
  const remove = async (test: CodeTest) => {
    setSaving(true);
    setError(null);
    try {
      await api.deleteCodeTest(test.id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete check");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Card
      title="Automated code checks"
      eyebrow="Code exercise"
      bodyClassName="flex flex-col gap-4 p-5"
    >
      <label className="flex flex-col gap-2 text-[13px] text-muted">
        Lesson
        <select
          className={`${INPUT} h-10`}
          value={moduleId}
          onChange={(event) => setModuleId(event.target.value)}
        >
          <option value="">Select a lesson</option>
          {modules.map((item) => (
            <option key={item.id} value={item.id}>
              {item.title}
            </option>
          ))}
        </select>
      </label>
      {loading && <p className="m-0 text-sm text-muted">Loading exercises…</p>}
      {error && (
        <p className={`m-0 rounded-xl px-3 py-2 text-sm ${TINT.peach}`}>
          {error}
        </p>
      )}
      {selected && (
        <>
          <label className="flex flex-col gap-2 text-[13px] text-muted">
            Exercise
            <select
              className={`${INPUT} h-10`}
              value={selected.exercise.id}
              onChange={(event) => setExerciseId(event.target.value)}
            >
              {exercises.map((item) => (
                <option key={item.exercise.id} value={item.exercise.id}>
                  {item.prompt}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-[13px] text-muted">
            Function name
            <input
              className={`${INPUT} h-10`}
              value={functionName}
              onChange={(event) => setFunctionName(event.target.value)}
              placeholder="add"
            />
          </label>
          <Button
            size="sm"
            onClick={() => void saveFunction()}
            disabled={saving}
          >
            Save function name
          </Button>
          <CodeTestEditor
            key={editingId ?? "new"}
            test={testDraft}
            onChange={setTestDraft}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={() => void saveTest()}
              disabled={saving}
            >
              {editingId ? "Save check" : "Add check"}
            </Button>
            {editingId && (
              <Button
                size="sm"
                variant="default"
                onClick={() => setEditingId(null)}
              >
                Cancel edit
              </Button>
            )}
          </div>
          <div className="flex flex-col gap-2">
            {selected.exercise.tests.map((test) => (
              <div
                key={test.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-soft px-3 py-2 text-xs text-muted font-mono"
              >
                <span className="min-w-0 truncate">
                  {test.name}: {JSON.stringify(test.args)} →{" "}
                  {JSON.stringify(test.expected)}
                </span>
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => {
                      setEditingId(test.id);
                      setTestDraft({
                        name: test.name,
                        args: test.args,
                        expected: test.expected,
                      });
                    }}
                    disabled={saving}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="default"
                    onClick={() => void remove(test)}
                    disabled={saving}
                  >
                    Delete
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
      {!loading && module && !selected && (
        <p className="m-0 text-sm text-muted">
          This lesson has no code exercises.
        </p>
      )}
    </Card>
  );
}
