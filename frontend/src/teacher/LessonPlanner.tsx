import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import { SparklesIcon } from "../ui/icons.tsx";
import { INPUT, TINT } from "../ui/styles.ts";
import { createBlankModuleDocument } from "./moduleBuilderDocument.ts";

type DraftPreview = { label: string; reply: string };

/** Creates a structured lesson draft, then opens it in the module builder for review. */
export default function LessonPlanner() {
  const navigate = useNavigate();
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("beginner");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftPreview, setDraftPreview] = useState<DraftPreview | null>(null);

  async function draft(event: FormEvent) {
    event.preventDefault();
    const trimmedTopic = topic.trim();
    if (!trimmedTopic) return;
    setBusy(true);
    setError(null);
    setDraftPreview(null);
    try {
      const { suggestions, warning } = await api.aiModuleSuggestions({
        document: createBlankModuleDocument(),
        request: `Create a complete ${level} coding lesson on "${trimmedTopic}". Return a reviewable module-builder document, not an outline. Use 2-4 ordered sections, learning goals in the introduction, a concise explanatory Markdown block in every section, and at least 3 student questions. Include an MCQ and short-answer check; include one small code exercise with starter code and 2-4 automated tests when the topic can be practised in code. Keep the lesson practical and suitable for one class period.`,
      });
      const suggestion = suggestions[0];
      const draftDocument = suggestion?.document;
      if (!draftDocument) {
        if (suggestion) {
          setDraftPreview({ label: suggestion.label, reply: suggestion.reply });
        } else {
          setError(
            warning ??
              "The assistant could not make a usable lesson draft. Please try again.",
          );
        }
        return;
      }
      navigate("/teacher/modules/new", {
        state: { plannerDocument: draftDocument },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft a lesson");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Create a lesson draft"
      eyebrow="AI-assisted planning"
      icon={<SparklesIcon className="size-[18px]" />}
      tint="lavender"
      bodyClassName="flex flex-col gap-4 p-5"
    >
      <p className="m-0 text-sm leading-relaxed text-muted">
        Give the assistant a topic and level. You will review the generated
        draft in the builder before saving or publishing it.
      </p>
      <form
        onSubmit={(event) => void draft(event)}
        className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_11rem_auto] sm:items-end"
      >
        <label className="flex flex-col gap-2 text-[13px] text-muted">
          Topic
          <input
            className={`${INPUT} h-10`}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="For example, loops and repetition"
            maxLength={200}
          />
        </label>
        <label className="flex flex-col gap-2 text-[13px] text-muted">
          Level
          <select
            className={`${INPUT} h-10`}
            value={level}
            onChange={(e) => setLevel(e.target.value)}
          >
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <Button
          type="submit"
          variant="primary"
          disabled={busy || !topic.trim()}
          className="h-10"
        >
          {busy ? "Creating…" : "Create lesson"}
        </Button>
      </form>
      {error && (
        <p
          role="alert"
          className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}
        >
          {error}
        </p>
      )}
      {draftPreview && (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface-soft p-4">
          <p className="m-0 font-medium text-ink">{draftPreview.label}</p>
          <p className="m-0 whitespace-pre-wrap text-sm text-muted">
            {draftPreview.reply}
          </p>
          <p className="m-0 text-xs text-muted">
            This is a planning draft, not a ready-to-save lesson. You can use it
            as a guide while building the lesson.
          </p>
        </div>
      )}
    </Card>
  );
}
