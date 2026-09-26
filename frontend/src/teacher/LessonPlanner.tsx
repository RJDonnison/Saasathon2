import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import { SparklesIcon } from "../ui/icons.tsx";
import { INPUT, TINT } from "../ui/styles.ts";
import { createBlankModuleDocument } from "./moduleBuilderDocument.ts";

/** Creates a structured lesson draft, then opens it in the module builder for review. */
export default function LessonPlanner() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("beginner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function draft(event: FormEvent) {
    event.preventDefault();
    if (!topic.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { suggestions } = await api.aiModuleSuggestions({
        document: createBlankModuleDocument(),
        request: `Create a complete lesson on "${topic.trim()}" for ${level} students in a coding classroom. Include learning goals in the introduction, a short reading, a few practice exercises, and a quick check for understanding. Fill in the complete module document so the teacher can review and edit it.`,
      });
      const document = suggestions[0]?.document;
      if (!document) {
        setError("The assistant could not make a usable lesson draft. Please try again.");
        return;
      }
      navigate("/teacher/modules/new", { state: { plannerDocument: document } });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft a lesson");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title="Plan a lesson" eyebrow="Lesson planner" icon={<SparklesIcon className="size-[18px]" />} tint="lavender" bodyClassName="flex flex-col gap-4 p-5">
      <form onSubmit={(event) => void draft(event)} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end">
        <label className="flex flex-col gap-2 text-[13px] text-muted">
          Topic
          <input className={`${INPUT} h-10`} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="For example, loops and repetition" maxLength={200} />
        </label>
        <label className="flex flex-col gap-2 text-[13px] text-muted">
          Level
          <select className={`${INPUT} h-10`} value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <Button type="submit" variant="primary" disabled={busy || !topic.trim()} className="h-10">{busy ? "Creating…" : "Create lesson"}</Button>
      </form>
      {error && <p role="alert" className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>{error}</p>}
    </Card>
  );
}
