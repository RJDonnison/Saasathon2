import Card from '../ui/Card.tsx'
import { PencilIcon } from '../ui/icons.tsx'
import { INPUT } from '../ui/styles.ts'

// PLACEHOLDER: a local, unsaved notes area.
export default function ScratchPad() {
  return (
    <Card title="Scratch pad" eyebrow="Just for you" icon={<PencilIcon />} tint="peach" bodyClassName="flex flex-col gap-2 p-5">
      <label className="sr-only" htmlFor="scratch-pad">
        Scratch pad notes
      </label>
      <textarea id="scratch-pad" className={`${INPUT} min-h-28 w-full resize-y py-2.5`} placeholder="Jot down ideas, steps, or questions…" />
      <p className="m-0 text-xs text-subtle">Notes stay on this page and aren’t saved yet.</p>
    </Card>
  )
}
