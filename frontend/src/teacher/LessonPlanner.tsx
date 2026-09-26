import { useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import Button from '../ui/Button.tsx'
import Card from '../ui/Card.tsx'
import Markdown from '../ui/Markdown.tsx'
import { SparklesIcon } from '../ui/icons.tsx'
import { INPUT, TINT } from '../ui/styles.ts'

/** Asks the AI drafting assistant (POST /api/ai/draft) for a lesson plan. The plan is a starting point to copy from. */
export default function LessonPlanner() {
  const [topic, setTopic] = useState('')
  const [level, setLevel] = useState('beginner')
  const [busy, setBusy] = useState(false)
  const [plan, setPlan] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function draft(event: FormEvent) {
    event.preventDefault()
    if (!topic.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { reply } = await api.aiDraft({
        request: `Draft a lesson plan on "${topic.trim()}" for ${level} students in a coding classroom. Include learning goals, a short reading, a few practice exercises, and a quick check for understanding.`,
      })
      setPlan(reply)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not draft a plan')
    } finally {
      setBusy(false)
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
        <Button type="submit" variant="primary" disabled={busy || !topic.trim()} className="h-10">{busy ? 'Drafting…' : 'Draft lesson plan'}</Button>
      </form>
      {error && <p role="alert" className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>{error}</p>}
      {plan && (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-5">
          <Markdown text={plan} />
        </div>
      )}
    </Card>
  )
}
