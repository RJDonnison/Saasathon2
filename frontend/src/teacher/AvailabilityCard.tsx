import { useState } from "react";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import { useDialog } from "../ui/DialogContext.tsx";
import { CalendarIcon } from "../ui/icons.tsx";
import type { ModuleAccess } from "../../../shared/types";

const OPTIONS: Array<{ value: ModuleAccess; label: string; hint: string }> = [
  {
    value: "anytime",
    label: "Open any time",
    hint: "Students can do this lesson whenever they like.",
  },
  {
    value: "live",
    label: "Only while I’m teaching it",
    hint: "It unlocks when you start a live lesson on it and locks again when you move the class on or end the lesson.",
  },
];

/** Whether students can open this lesson whenever, or only while the teacher's live lesson is on it. */
export default function AvailabilityCard({
  moduleId,
  access,
}: {
  moduleId: string | undefined;
  access: ModuleAccess;
}) {
  const { toast } = useDialog();
  const [saved, setSaved] = useState(access);
  const [choice, setChoice] = useState(access);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!moduleId) return;
    setSaving(true);
    try {
      await api.updateModuleAvailability(moduleId, { access: choice });
      setSaved(choice);
      toast(
        choice === "live"
          ? "Students can only open this lesson while you teach it."
          : "This lesson is open any time.",
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not save this setting.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card
      title="When students can open it"
      icon={<CalendarIcon className="size-[18px]" />}
      tint="peach"
      bodyClassName="flex flex-col gap-4 p-5"
    >
      {!moduleId ? (
        <p className="m-0 text-sm text-muted">
          Save the lesson first, then choose when students can open it.
        </p>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label="When students can open this lesson"
            className="grid gap-3 sm:grid-cols-2"
          >
            {OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={choice === option.value}
                onClick={() => setChoice(option.value)}
                className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-4 text-left transition hover:bg-surface-soft aria-checked:border-accent aria-checked:bg-mint/70"
              >
                <strong className="text-sm! font-semibold! text-ink">
                  {option.label}
                </strong>
                <span className="text-xs! font-normal! leading-relaxed! text-muted">
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={saving || choice === saved}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}
