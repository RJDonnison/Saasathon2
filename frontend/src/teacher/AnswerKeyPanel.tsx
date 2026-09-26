import { useEffect, useMemo, useState } from "react";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import { INPUT, TINT } from "../ui/styles.ts";
import type {
  Module,
  TeacherModule,
  TeacherQuestion,
} from "../../../shared/types";

function AnswerKeyForm({
  question,
  onSaved,
}: {
  question: TeacherQuestion;
  onSaved: () => Promise<void>;
}) {
  const [answerKey, setAnswerKey] = useState(question.answerKey ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!answerKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.updateQuestion(question.id, { answerKey: answerKey.trim() });
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save answer");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <label className="flex flex-col gap-2 text-[13px] text-muted">
        Correct answer
        <input
          className={`${INPUT} h-10`}
          value={answerKey}
          onChange={(event) => setAnswerKey(event.target.value)}
          placeholder="Enter the exact accepted answer"
        />
      </label>
      {question.kind === "mcq" && (
        <p className="m-0 text-xs text-muted">
          Use the option text exactly as shown to students.
        </p>
      )}
      {error && (
        <p className={`m-0 rounded-xl px-3 py-2 text-sm ${TINT.peach}`}>
          {error}
        </p>
      )}
      <Button
        size="sm"
        variant="primary"
        onClick={() => void save()}
        disabled={saving || !answerKey.trim()}
      >
        Save answer
      </Button>
    </>
  );
}

export default function AnswerKeyPanel({ modules }: { modules: Module[] }) {
  const [moduleId, setModuleId] = useState("");
  const [module, setModule] = useState<TeacherModule | null>(null);
  const [questionId, setQuestionId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const activeModuleId = moduleId || modules[0]?.id || "";

  useEffect(() => {
    if (!activeModuleId) return;
    api
      .getModule(activeModuleId)
      .then((value) => setModule(value as TeacherModule))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not load questions",
        ),
      );
  }, [activeModuleId]);

  const questions = useMemo(
    () =>
      module?.sections.flatMap((section) =>
        section.questions.filter(
          (question) => question.kind === "mcq" || question.kind === "short",
        ),
      ) ?? [],
    [module],
  );
  const selected =
    questions.find((question) => question.id === questionId) ?? questions[0];

  return (
    <Card
      title="Defined answers"
      eyebrow="MCQ & short answer"
      bodyClassName="flex flex-col gap-4 p-5"
    >
      <label className="flex flex-col gap-2 text-[13px] text-muted">
        Lesson
        <select
          className={`${INPUT} h-10`}
          value={activeModuleId}
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
      {error && (
        <p className={`m-0 rounded-xl px-3 py-2 text-sm ${TINT.peach}`}>
          {error}
        </p>
      )}
      {selected && (
        <>
          <label className="flex flex-col gap-2 text-[13px] text-muted">
            Question
            <select
              className={`${INPUT} h-10`}
              value={selected.id}
              onChange={(event) => setQuestionId(event.target.value)}
            >
              {questions.map((question) => (
                <option key={question.id} value={question.id}>
                  {question.prompt}
                </option>
              ))}
            </select>
          </label>
          <AnswerKeyForm
            key={selected.id}
            question={selected}
            onSaved={async () =>
              setModule((await api.getModule(activeModuleId)) as TeacherModule)
            }
          />
        </>
      )}
      {module && !selected && (
        <p className="m-0 text-sm text-muted">
          This lesson has no multiple-choice or short-answer questions.
        </p>
      )}
    </Card>
  );
}
