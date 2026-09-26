import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.ts'
import Button from '../ui/Button.tsx'
import Dot from '../ui/Dot.tsx'
import { INPUT, TINT } from '../ui/styles.ts'
import { plural } from '../student/lessons.ts'
import type { LessonSession, Module } from '../../../shared/types'

/**
 * The teacher's lesson controls, styled as the dark banner: pick a lesson and start it; while it is live, move the
 * class to another lesson or end it. Students can see the current lesson in real time.
 */
export default function LiveLessonControl({
  classroomId,
  classroomName,
  lessons,
  session,
  onSession,
  online,
  students,
  hands,
}: {
  classroomId: string
  classroomName: string
  lessons: Module[]
  session: LessonSession | null | undefined
  onSession: (session: LessonSession | null) => void
  online: number
  students: number
  hands: number
}) {
  const navigate = useNavigate()
  const [pick, setPick] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function run(action: () => Promise<{ session: LessonSession | null }>) {
    setBusy(true)
    setError(null)
    try {
      onSession((await action()).session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBusy(false)
    }
  }

  function endLesson() {
    if (!session) return
    const sessionId = session.id
    void run(async () => {
      const result = await api.endSession(classroomId)
      navigate(`/teacher/feedback/${encodeURIComponent(sessionId)}`)
      return result
    })
  }

  const chosen = lessons.some((l) => l.id === pick) ? pick : (lessons[0]?.id ?? '')
  const index = session ? lessons.findIndex((l) => l.id === session.moduleId) : -1
  const stats = `${online} of ${plural(students, 'student')} in class. ${hands ? `${plural(hands, 'hand')} raised.` : 'No hands raised.'}`

  return (
    <div className="flex flex-col gap-5 rounded-2xl bg-ink p-6 text-white sm:px-7 sm:py-6">
      <div className="flex flex-col gap-3">
        <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${TINT.mint}`}>
          <Dot live={!!session} />
          {session ? 'Live now' : 'Ready when you are'}
        </span>
        <h2 className="m-0! font-display! text-[24px]! leading-tight! font-semibold! tracking-[-0.03em]! text-white">
          {session ? session.moduleTitle : `Start a lesson for ${classroomName}`}
        </h2>
        <p className="m-0 text-sm text-white/80">
          {session ? stats : lessons.length ? 'Pick a lesson. Students see it as soon as you start, and their screens follow yours.' : 'Add a lesson below first, then start it here.'}
        </p>
      </div>

      {session === undefined ? null : session === null ? (
        lessons.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <select
              className={`${INPUT} h-11 min-w-0 flex-1 sm:max-w-sm`}
              value={chosen}
              onChange={(e) => setPick(e.target.value)}
              aria-label="Lesson to start"
            >
              {lessons.map((l, i) => (
                <option key={l.id} value={l.id}>
                  {i + 1}. {l.title}
                </option>
              ))}
            </select>
            <Button variant="primary" size="lg" disabled={busy || !chosen} onClick={() => void run(() => api.startSession(classroomId, chosen))}>
              {busy ? 'Starting…' : 'Start lesson'}
            </Button>
          </div>
        )
      ) : (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={busy || index <= 0}
              onClick={() => void run(() => api.updateSession(classroomId, { moduleId: lessons[index - 1].id }))}
            >
              ‹ Previous
            </Button>
            <span className="text-xs text-white/70">{index >= 0 ? `Lesson ${index + 1} of ${lessons.length}` : 'Lesson'}</span>
            <Button
              size="sm"
              disabled={busy || index < 0 || index >= lessons.length - 1}
              onClick={() => void run(() => api.updateSession(classroomId, { moduleId: lessons[index + 1].id }))}
            >
              Next ›
            </Button>
          </div>
          <div className="flex-1" />
          <Button variant="peach" disabled={busy} onClick={endLesson}>
            End lesson
          </Button>
        </div>
      )}
      {error && <p role="alert" className="m-0 text-sm text-peach-ink">{error}</p>}
    </div>
  )
}
