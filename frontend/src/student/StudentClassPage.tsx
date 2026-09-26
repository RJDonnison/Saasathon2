import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'
import Button from '../ui/Button.tsx'
import ClassTopBar from '../ui/ClassTopBar.tsx'
import Heading from '../ui/Heading.tsx'
import { CARD, TINT } from '../ui/styles.ts'
import { introSnippet, pickCurrent, plural, STATUS_LABEL, timeAgo } from './lessons.ts'
import { useClassData } from './useClassData.ts'
import { useLiveSession } from '../useLiveSession.ts'
import Dot from '../ui/Dot.tsx'
import type { ExerciseSummary } from '../../../shared/types'

const RUN_LABEL = { ok: 'Last run worked', error: 'Last run had an error' } as const

function runLabel(ex: ExerciseSummary) {
  return ex.lastRun ? `${RUN_LABEL[ex.lastRun]}, ${plural(ex.runs, 'run')}` : 'Not started'
}

export default function StudentClassPage() {
  const { classroomId = '' } = useParams()
  const { user } = useAuth()
  const { classroom, lessons, announcements, error } = useClassData()
  const { session } = useLiveSession()

  const teacher = classroom?.teacherName ?? 'Your teacher'
  const classPath = `/student/class/${classroomId || user?.classroomId || ''}`
  const all = lessons ?? []
  const done = all.filter((l) => l.status === 'completed').length
  const current = pickCurrent(all)
  const started = all.some((l) => l.status !== 'not_started')
  const upNext = current ? all.slice(all.indexOf(current) + 1).find((l) => l.status !== 'completed') : undefined
  const exercisesRun = current ? current.exercises.filter((e) => e.runs > 0).length : 0

  return (
    <>
      <ClassTopBar backTo="/student" title={classroom?.name ?? 'Your class'} subtitle={teacher} />
      <div className="mx-auto max-w-[1020px] px-4 py-6 sm:px-6 sm:py-8">
        {error && <p className={`mb-5 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>{error}</p>}
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,.95fr)]">
          <div className="flex flex-col gap-5">
            {session && (
              <section className="flex flex-col justify-between gap-4 rounded-2xl bg-ink p-5 text-white sm:flex-row sm:items-center sm:p-6">
                <div className="min-w-0">
                  <span className={`mb-2 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${TINT.mint}`}><Dot live />Live now</span>
                  <h2 className="m-0! font-display! text-[20px]! leading-tight! font-semibold! text-white">{session.moduleTitle}</h2>
                  <p className="mb-0! mt-1.5! text-sm! text-white/80">{teacher} is {session.phase === 'teach' ? 'teaching' : 'running work time'}.</p>
                </div>
                <Link to={`${classPath}/live`}><Button variant="primary" size="lg">Join lesson</Button></Link>
              </section>
            )}

            <section className={`${CARD} p-5 sm:p-6`}>
              <Heading>{current ? (started ? 'Pick up where you left off' : 'Start your first lesson') : 'Your lessons'}</Heading>
              {lessons === null ? (
                <div className="mt-4 h-24 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" aria-busy="true" />
              ) : current ? (
                <>
                  <h3 className="mb-1! mt-3! font-display! text-[16px]! font-semibold!">{current.title}</h3>
                  <p className="mb-0! text-[13px]! text-muted">
                    {STATUS_LABEL[current.status]}. {plural(current.sections.length, 'section')}
                    {current.exercises.length > 0 && `, ${exercisesRun} of ${plural(current.exercises.length, 'code exercise')} tried`}.
                  </p>
                  {introSnippet(current.content, 220) && <p className="mb-0! mt-3! text-[14px]! leading-relaxed!">{introSnippet(current.content, 220)}</p>}
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${TINT.lavender}`}>Helper: hints, never answers</span>
                    <Link to={`${classPath}/live?lesson=${current.id}`}>
                      <Button variant="primary" size="lg">{started ? 'Continue lesson' : 'Start lesson'}</Button>
                    </Link>
                  </div>
                </>
              ) : (
                <p className="mb-0! mt-3! text-[14px]! text-muted">
                  {all.length ? 'You’ve finished every lesson. Reopen any of them below.' : `${teacher} hasn’t added any lessons yet.`}
                </p>
              )}
            </section>

            <section>
              <Heading className="mb-3">Lessons</Heading>
              {all.length === 0 && lessons !== null && (
                <p className={`${CARD} m-0 p-5 text-sm text-muted`}>No lessons yet.</p>
              )}
              <div className="flex flex-col gap-3">
                {all.map((lesson, i) => (
                  <article key={lesson.id} className={`${CARD} p-5 sm:p-6`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="mb-1! text-xs! font-medium! text-muted">Lesson {i + 1}</p>
                        <h3 className="m-0! font-display! text-[17px]! font-semibold!">{lesson.title}</h3>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${lesson.status === 'completed' ? TINT.mint : lesson.status === 'in_progress' ? TINT.peach : 'bg-surface-soft text-muted'}`}>{STATUS_LABEL[lesson.status]}</span>
                    </div>
                    {lesson.sections.length > 0 && (
                      <>
                        <h4 className="mb-2! mt-4! font-display! text-[13px]! font-semibold!">What’s in this lesson</h4>
                        <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
                          {lesson.sections.map((section, n) => (
                            <li key={section.id} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-soft px-2.5 py-1.5 text-xs"><b className="grid size-5 place-items-center rounded-full bg-surface text-[10px]">{n + 1}</b>{section.title}</li>
                          ))}
                        </ol>
                      </>
                    )}
                    {lesson.exercises.length > 0 && (
                      <>
                        <h4 className="mb-1! mt-4! font-display! text-[13px]! font-semibold!">Your work</h4>
                        {lesson.exercises.map((ex) => (
                          <div key={ex.id} className="flex items-center justify-between gap-3 border-b border-border py-2.5 text-[13px] last:border-0">
                            <span className="min-w-0 truncate">{ex.title}</span>
                            <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${ex.lastRun === 'ok' ? TINT.mint : ex.lastRun === 'error' ? TINT.peach : 'bg-surface-soft text-muted'}`}>{runLabel(ex)}</span>
                          </div>
                        ))}
                      </>
                    )}
                    <div className="mt-4">
                      <Link to={`${classPath}/live?lesson=${lesson.id}`}><Button>{lesson.status === 'completed' ? 'Review lesson' : lesson.status === 'in_progress' ? 'Continue' : 'Open lesson'}</Button></Link>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>

          <aside className="flex flex-col gap-4">
            <section className={`${CARD} p-5`}>
              <Heading>Your progress</Heading>
              <p className="mb-0! mt-3! text-[14px]!">{all.length ? `${done} of ${plural(all.length, 'lesson')} complete` : 'No lessons to complete yet.'}</p>
              {all.length > 0 && (
                <div className="mt-3 flex gap-1" role="img" aria-label={`${done} of ${all.length} lessons complete`}>
                  {all.map((l) => (
                    <span key={l.id} className={`h-2 flex-1 rounded-full ${l.status === 'completed' ? 'bg-accent' : l.status === 'in_progress' ? 'bg-accent/40' : 'bg-surface-soft'}`} />
                  ))}
                </div>
              )}
            </section>
            {upNext && (
              <section className={`${CARD} p-5`}>
                <Heading>Up next</Heading>
                <h3 className="mb-1! mt-3! font-display! text-[16px]! font-semibold!">{upNext.title}</h3>
                {introSnippet(upNext.content) && <p className="mb-0! mt-2! text-[14px]! text-muted">{introSnippet(upNext.content)}</p>}
              </section>
            )}
            <section className={`${CARD} p-5`}>
              <Heading>From {teacher}</Heading>
              {announcements === null ? null : announcements.length === 0 ? (
                <p className="mb-0! mt-3! text-[13px]! text-muted">No notes yet.</p>
              ) : (
                announcements.slice(0, 5).map((note) => (
                  <div key={note.id} className="mt-3 rounded-xl bg-surface-soft p-3 first:mt-3">
                    <strong className="text-xs">{timeAgo(note.createdAt)}</strong>
                    <p className="mb-0! mt-1! text-[13px]! whitespace-pre-line">{note.text}</p>
                  </div>
                ))
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  )
}
