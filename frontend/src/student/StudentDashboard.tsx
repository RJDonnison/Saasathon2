import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.ts'
import { useAuth } from '../auth/useAuth.ts'
import Button from '../ui/Button.tsx'
import Heading from '../ui/Heading.tsx'
import { CARD, TINT } from '../ui/styles.ts'
import InvitationList from './InvitationList.tsx'
import { introSnippet, pickCurrent, plural, STATUS_LABEL, timeAgo } from './lessons.ts'
import { useClassData } from './useClassData.ts'
import { useLiveSession } from '../useLiveSession.ts'
import Dot from '../ui/Dot.tsx'
import type { MyClassroom } from '../../../shared/types'

const STATUS_TINT = { not_started: 'bg-surface-soft text-muted', in_progress: TINT.peach, completed: TINT.mint } as const

export default function StudentDashboard() {
  const { user, switchClassroom } = useAuth()
  const { classroom, lessons, announcements, error } = useClassData()
  const { session } = useLiveSession()
  const [classes, setClasses] = useState<MyClassroom[]>([])
  const [showAll, setShowAll] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)

  const classroomId = user?.classroomId
  useEffect(() => {
    let active = true
    void api.myClassrooms().then((list) => active && setClasses(list.filter((c) => c.role === 'student'))).catch(() => {})
    return () => {
      active = false
    }
  }, [classroomId])

  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : 'Evening'
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
  const firstName = user?.name.trim().split(/\s+/)[0] || 'there'
  const teacher = classroom?.teacherName ?? 'your teacher'
  const classPath = `/student/class/${classroomId ?? ''}`

  const all = lessons ?? []
  const done = all.filter((l) => l.status === 'completed').length
  const todo = all.filter((l) => l.status !== 'completed')
  const current = pickCurrent(all)
  const started = all.some((l) => l.status !== 'not_started')

  async function open(target: MyClassroom) {
    setSwitchingId(target.id)
    try {
      await switchClassroom(target.id)
    } catch (err) {
      console.warn('Could not switch class:', err)
    } finally {
      setSwitchingId(null)
    }
  }

  return (
    <div className="mx-auto flex max-w-[1020px] flex-col gap-6 sm:gap-7">
      <InvitationList />

      <div className="pt-1">
        <p className="mb-1! text-[13px]! font-medium! text-muted">{today}</p>
        <Heading as="h1" variant="title" className="text-[34px]! sm:text-[38px]!">{greeting}, {firstName}</Heading>
        <p className="mt-2! text-[15px]! text-muted">
          {lessons === null
            ? 'Loading your classes…'
            : all.length === 0
              ? `${classroom?.name ?? 'Your class'} has no lessons yet.`
              : `${done} of ${plural(all.length, 'lesson')} complete in ${classroom?.name ?? 'your class'}.`}
        </p>
      </div>

      {error && <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>{error}</p>}

      {session && (
        <Link to={`${classPath}/live`} className="flex flex-col justify-between gap-5 rounded-2xl bg-ink p-6 text-white sm:flex-row sm:items-center sm:px-7 sm:py-6">
          <div className="min-w-0">
            <span className={`mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${TINT.mint}`}><Dot live />Live now</span>
            <h2 className="m-0! font-display! text-[24px]! leading-tight! font-semibold! tracking-[-0.03em]! text-white">{session.moduleTitle} with {teacher}</h2>
            <p className="mb-0! mt-2! text-sm! text-white/80">{session.phase === 'teach' ? `${teacher} is teaching. Join to follow along.` : `Work time. Join to work on this lesson with the helper.`}</p>
          </div>
          <Button variant="primary" size="lg" className="sm:min-w-[132px]">Join lesson</Button>
        </Link>
      )}

      {!session && lessons !== null && (
        <div className="flex flex-col justify-between gap-5 rounded-2xl bg-ink p-6 text-white sm:flex-row sm:items-center sm:px-7 sm:py-6">
          <div className="min-w-0">
            <span className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${TINT.mint}`}>
              {current ? (started ? 'Pick up where you left off' : 'Up next') : all.length ? 'All caught up' : 'Waiting for lessons'}
            </span>
            <h2 className="m-0! font-display! text-[24px]! leading-tight! font-semibold! tracking-[-0.03em]! text-white">
              {current ? current.title : all.length ? `You’ve finished every lesson in ${classroom?.name ?? 'this class'}` : `${classroom?.name ?? 'Your class'} with ${teacher}`}
            </h2>
            <p className="mb-0! mt-2! text-sm! text-white/80">
              {current
                ? introSnippet(current.content) || `${plural(current.sections.length, 'section')} to work through.`
                : all.length
                  ? 'Nice work. You can reopen any lesson from the list below.'
                  : `When ${teacher} adds a lesson it will show up here.`}
            </p>
          </div>
          {current && (
            <Link to={`${classPath}/live?lesson=${current.id}`}>
              <Button variant="primary" size="lg" className="sm:min-w-[132px]">{started ? 'Continue lesson' : 'Start lesson'}</Button>
            </Link>
          )}
        </div>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,.95fr)]">
        <section className={`${CARD} overflow-hidden`}>
          <header className="flex items-center justify-between px-5 pt-5 pb-3 sm:px-6">
            <Heading>Lessons</Heading>
            <Link to={classPath} className="text-[13px]! font-semibold! text-mint-ink underline underline-offset-2">Class page</Link>
          </header>
          <div className="px-4 pb-4 sm:px-5">
            {lessons === null ? (
              <div className="flex flex-col gap-2 py-2" aria-busy="true">
                {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" />)}
              </div>
            ) : all.length === 0 ? (
              <p className="m-0 border-t border-border px-2 py-6 text-center text-sm text-muted">No lessons yet.</p>
            ) : (
              all.map((lesson, i) => (
                <Link key={lesson.id} to={`${classPath}/live?lesson=${lesson.id}`} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 border-t border-border px-2 py-3.5 hover:bg-surface-soft">
                  <span className="grid size-8 place-items-center rounded-full border border-border bg-surface text-[13px] font-semibold text-muted">{i + 1}</span>
                  <span className="min-w-0">
                    <strong className="block truncate text-[14px]">{lesson.title}</strong>
                    <span className="block text-xs text-muted">
                      {plural(lesson.sections.length, 'section')}
                      {lesson.exercises.length > 0 && `, ${plural(lesson.exercises.length, 'code exercise')}`}
                    </span>
                  </span>
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TINT[lesson.status]}`}>{STATUS_LABEL[lesson.status]}</span>
                </Link>
              ))
            )}
          </div>
        </section>

        <div className="flex flex-col gap-4">
          <section className={`${CARD} p-5`}>
            <header className="mb-3 flex items-center justify-between"><Heading>To do</Heading><span className="text-xs text-muted">{plural(todo.length, 'lesson')} left</span></header>
            {todo.length === 0 ? (
              <p className="m-0 border-t border-border pt-3 text-[13px] text-muted">{all.length ? 'Everything is finished.' : 'Nothing to do yet.'}</p>
            ) : (
              todo.slice(0, showAll ? undefined : 4).map((item) => (
                <Link key={item.id} to={`${classPath}/live?lesson=${item.id}`} className="block border-t border-border py-3 first:border-0">
                  <strong className="block text-[13px]">{item.title}</strong>
                  <span className="mt-1 block text-xs text-muted">{classroom?.name}</span>
                  <span className="mt-1 block text-xs text-muted">{STATUS_LABEL[item.status]}</span>
                </Link>
              ))
            )}
            {todo.length > 4 && (
              <button onClick={() => setShowAll((v) => !v)} className="mt-2 text-[13px]! font-semibold! text-mint-ink underline underline-offset-2">{showAll ? 'Show less' : `See all ${todo.length}`}</button>
            )}
          </section>

          <section className={`${CARD} p-5`}>
            <Heading>From your teacher</Heading>
            {announcements === null ? null : announcements.length === 0 ? (
              <p className="mb-0! mt-3! text-[13px]! text-muted">No notes from {teacher} yet.</p>
            ) : (
              announcements.slice(0, 3).map((note) => (
                <article key={note.id} className="mt-3 border-t border-border pt-3 first:border-0">
                  <p className="mb-1! text-xs! text-muted">{note.authorName}, {timeAgo(note.createdAt)}</p>
                  <p className="mb-0! text-[13px]! leading-relaxed! whitespace-pre-line">{note.text}</p>
                </article>
              ))
            )}
          </section>
        </div>
      </div>

      <section>
        <Heading className="mb-3">My classes</Heading>
        <div className={`${CARD} overflow-hidden`}>
          <div className="hidden grid-cols-[1.4fr_1fr_1fr_auto] gap-4 bg-surface-soft px-5 py-3 text-xs font-medium text-muted sm:grid"><span>Class</span><span>Teacher</span><span>Progress</span><span className="w-20" /></div>
          {classes.length === 0 ? (
            <p className="m-0 px-5 py-4 text-sm text-muted">You haven’t joined a class yet. Invitations from your teachers appear at the top of this page.</p>
          ) : (
            classes.map((c) => (
              <div key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-border px-4 py-3.5 first:border-0 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:gap-4 sm:px-5">
                <span className="min-w-0">
                  <strong className="block truncate text-[14px]">{c.name}{c.active && <small className={`ml-2 rounded-full px-2 py-1 text-[10px] font-semibold ${TINT.mint}`}>Current</small>}</strong>
                  <small className="mt-0.5 block text-xs text-muted sm:hidden">{c.teacherName ?? 'No teacher yet'}</small>
                </span>
                <span className="hidden truncate text-[13px] sm:block">{c.teacherName ?? 'No teacher yet'}</span>
                <span className="hidden text-[13px] sm:block">{c.lessonCount ? `${c.completedCount} of ${plural(c.lessonCount, 'lesson')} done` : 'No lessons yet'}</span>
                {c.active ? (
                  <Link to={`/student/class/${c.id}`}><Button size="sm" className="w-20">Open</Button></Link>
                ) : (
                  <Button size="sm" className="w-20" disabled={switchingId !== null} onClick={() => void open(c)}>{switchingId === c.id ? '…' : 'Switch'}</Button>
                )}
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  )
}
