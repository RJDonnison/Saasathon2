import { useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import Button from '../ui/Button.tsx'
import { INPUT } from '../ui/styles.ts'
import type { Module } from '../../../shared/types'

/** Adds a lesson (title + intro) to the active classroom. Sections and exercises are authored elsewhere. */
export default function NewLessonForm({ onCreated }: { onCreated: (lesson: Module) => void }) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [intro, setIntro] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!title.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      onCreated(await api.createModule({ title: title.trim(), content: intro.trim() }))
      setTitle('')
      setIntro('')
      setOpen(false)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not add the lesson')
    } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="border-t border-border p-4">
        <Button onClick={() => setOpen(true)}>＋ Add a lesson</Button>
      </div>
    )
  }
  return (
    <form onSubmit={(event) => void submit(event)} className="flex flex-col gap-3 border-t border-border p-5">
      <input className={`${INPUT} h-10 w-full`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lesson title, for example Loops and repetition" aria-label="Lesson title" maxLength={120} />
      <textarea className={`${INPUT} min-h-24 resize-y py-3`} value={intro} onChange={(e) => setIntro(e.target.value)} placeholder="A short introduction for students (Markdown works)" aria-label="Lesson introduction" />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" disabled={busy || !title.trim()}>{busy ? 'Adding…' : 'Add lesson'}</Button>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
        {message && <span role="status" className="text-sm text-muted">{message}</span>}
      </div>
    </form>
  )
}
