import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import { timeAgo } from '../student/lessons.ts'
import Button from '../ui/Button.tsx'
import Card from '../ui/Card.tsx'
import { PencilIcon, XIcon } from '../ui/icons.tsx'
import { INPUT, TINT } from '../ui/styles.ts'
import type { Announcement } from '../../../shared/types'

/** Post short notes to the class; students see them on their dashboard and class page. */
export default function AnnouncementsCard({ classroomId }: { classroomId: string }) {
  const [notes, setNotes] = useState<Announcement[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void api.getAnnouncements(classroomId).then((list) => active && setNotes(list)).catch(() => {})
    return () => {
      active = false
    }
  }, [classroomId])

  async function post(event: FormEvent) {
    event.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setMessage(null)
    try {
      const note = await api.postAnnouncement(classroomId, text.trim())
      setNotes((current) => [note, ...current])
      setText('')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not post the note')
    } finally {
      setBusy(false)
    }
  }

  async function remove(note: Announcement) {
    try {
      await api.deleteAnnouncement(classroomId, note.id)
      setNotes((current) => current.filter((n) => n.id !== note.id))
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Could not delete the note')
    }
  }

  return (
    <Card title="Post to the class" icon={<PencilIcon className="size-[18px]" />} tint="peach" bodyClassName="flex flex-col gap-4 p-5">
      <form onSubmit={(event) => void post(event)} className="flex flex-col gap-3">
        <textarea
          className={`${INPUT} min-h-20 resize-y py-3`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="For example, bring your laptop charger on Thursday."
          aria-label="Note to the class"
          maxLength={1000}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={busy || !text.trim()}>{busy ? 'Posting…' : 'Post note'}</Button>
          {message && <span role="alert" className={`rounded-lg px-3 py-2 text-sm ${TINT.peach}`}>{message}</span>}
        </div>
      </form>
      {notes.length > 0 && (
        <ul className="m-0 flex list-none flex-col divide-y divide-border rounded-xl border border-border p-0">
          {notes.slice(0, 5).map((note) => (
            <li key={note.id} className="flex items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="m-0 text-sm whitespace-pre-line text-ink">{note.text}</p>
                <p className="m-0 text-xs text-muted">{timeAgo(note.createdAt)}</p>
              </div>
              <Button size="icon-sm" onClick={() => void remove(note)} aria-label="Delete note"><XIcon className="size-3.5" /></Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
