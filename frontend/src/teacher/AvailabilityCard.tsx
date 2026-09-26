import { useState } from "react";
import { api } from "../api.ts";
import Button from "../ui/Button.tsx";
import Card from "../ui/Card.tsx";
import { useDialog } from "../ui/DialogContext.tsx";
import { CalendarIcon } from "../ui/icons.tsx";
import { INPUT } from "../ui/styles.ts";

const pad = (n: number) => String(n).padStart(2, "0");
/** An ISO instant as the local `YYYY-MM-DDTHH:mm` a datetime-local input wants. */
function toInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const fromInput = (value: string) => (value ? new Date(value).toISOString() : null);

/** When students may open this lesson. Empty on a side = no limit; a lesson run live is always open. */
export default function AvailabilityCard({
  moduleId,
  opensAt,
  closesAt,
}: {
  moduleId: string | undefined;
  opensAt: string | null;
  closesAt: string | null;
}) {
  const { toast } = useDialog();
  const [saved, setSaved] = useState({ opensAt, closesAt });
  const [opens, setOpens] = useState(toInput(opensAt));
  const [closes, setCloses] = useState(toInput(closesAt));
  // "Any time" lessons have no window at all; the times typed below are kept if the teacher switches back.
  const [anytime, setAnytime] = useState(!opensAt && !closesAt);
  const [saving, setSaving] = useState(false);
  const next = {
    opensAt: anytime ? null : fromInput(opens),
    closesAt: anytime ? null : fromInput(closes),
  };
  const dirty = next.opensAt !== saved.opensAt || next.closesAt !== saved.closesAt;
  const backwards = !anytime && !!opens && !!closes && new Date(closes) <= new Date(opens);
  const invalid = backwards || (!anytime && !opens && !closes);

  async function save() {
    if (!moduleId) return;
    setSaving(true);
    try {
      await api.updateModuleAvailability(moduleId, next);
      setSaved(next);
      toast(
        anytime
          ? "This lesson is open any time."
          : "Lesson times saved.",
      );
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not save lesson times.",
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
          <p className="m-0 text-sm leading-relaxed text-muted">
            Choose whether students can do this lesson at any point, or only
            between two times. Outside the times it shows as locked. A lesson
            you start live is open to the class either way.
          </p>
          <div
            role="radiogroup"
            aria-label="When students can open this lesson"
            className="flex flex-wrap gap-2"
          >
            <Button
              role="radio"
              aria-checked={anytime}
              variant={anytime ? "primary" : "default"}
              onClick={() => setAnytime(true)}
            >
              Open any time
            </Button>
            <Button
              role="radio"
              aria-checked={!anytime}
              variant={anytime ? "default" : "primary"}
              onClick={() => setAnytime(false)}
            >
              Only between set times
            </Button>
          </div>
          {!anytime && (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2 text-sm text-muted">
              Opens
              <input
                type="datetime-local"
                className={`${INPUT} h-11`}
                value={opens}
                onChange={(event) => setOpens(event.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2 text-sm text-muted">
              Closes
              <input
                type="datetime-local"
                className={`${INPUT} h-11`}
                value={closes}
                onChange={(event) => setCloses(event.target.value)}
              />
            </label>
          </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="primary"
              disabled={saving || !dirty || invalid}
              onClick={() => void save()}
            >
              {saving ? "Saving…" : "Save times"}
            </Button>
            {backwards && (
              <span role="alert" className="text-sm text-peach-ink">
                Closing time must be after the opening time.
              </span>
            )}
            {!anytime && !opens && !closes && (
              <span className="text-sm text-muted">
                Set an opening time, a closing time, or both.
              </span>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
