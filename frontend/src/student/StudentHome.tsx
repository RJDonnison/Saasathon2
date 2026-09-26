import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api } from '../api.ts'
import { useAuth } from '../auth/useAuth.ts'
import ModuleView from './ModuleView.tsx'
import AiChatPanel from './AiChatPanel.tsx'
import RaiseHandButton from './RaiseHandButton.tsx'
import { WorkspaceProvider } from './WorkspaceContext.tsx'
import Button from '../ui/Button.tsx'
import Eyebrow from '../ui/Eyebrow.tsx'
import Heading from '../ui/Heading.tsx'
import { BookIcon } from '../ui/icons.tsx'
import { CARD, FOCUS_RING, INPUT, TINT } from '../ui/styles.ts'
import type { Classroom, Module } from '../../../shared/types'

export default function StudentHome() {
  const { user, joinClassroom } = useAuth()
  const [modules, setModules] = useState<Module[] | null>(null)
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [currentId, setCurrentId] = useState<string | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [joinMessage, setJoinMessage] = useState('')
  const lessonNav = useRef<HTMLElement>(null)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    api
      .listModules(user.classroomId)
      .then((list) => {
        if (cancelled) return
        setModules(list)
        setCurrentId((id) => id ?? list[0]?.id ?? null)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your lessons')
      })
    api
      .getClassroom(user.classroomId)
      .then((c) => {
        if (!cancelled) setClassroom(c)
      })
      .catch(() => {}) // the classroom name is just a nicety
    return () => {
      cancelled = true
    }
  }, [user])

  // Keep the active lesson chip visible in the horizontal scroller (matters on phones).
  useEffect(() => {
    lessonNav.current
      ?.querySelector('[aria-current="true"]')
      ?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [currentId, modules])

  async function join(e: FormEvent) {
    e.preventDefault()
    try {
      await joinClassroom({ roomCode: joinCode, role: 'student' })
      setJoinMessage('You joined the classroom. Refreshing your dashboard…')
      window.location.assign('/student')
    } catch (err) {
      setJoinMessage(err instanceof Error ? err.message : 'Could not join this classroom')
    }
  }

  const currentIndex = modules?.findIndex((m) => m.id === currentId) ?? -1
  const current = currentIndex >= 0 ? modules![currentIndex] : null
  const firstName = user?.name.trim().split(/\s+/)[0] ?? ''

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-3">
          <Eyebrow>{classroom ? `Your learning space · ${classroom.name}` : 'Your learning space'}</Eyebrow>
          <Heading as="h1" variant="title">
            Welcome back, {firstName}.
          </Heading>
          <p className="m-0 text-[15px] text-muted">Choose a lesson to see what you’ll learn next.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span>Need help in class?</span>
          <RaiseHandButton />
        </div>
      </div>

      {error && <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>{error}</p>}

      {modules === null && !error && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading your lessons">
          <div className="h-9 w-2/3 animate-pulse rounded-[10px] bg-surface-soft motion-reduce:animate-none" />
          <div className="h-40 animate-pulse rounded-[10px] bg-surface-soft motion-reduce:animate-none" />
        </div>
      )}

      {modules && modules.length === 0 && (
        <div className={`flex flex-col items-center gap-3 px-6 py-14 text-center ${CARD}`}>
          <span className={`grid size-12 place-items-center rounded-2xl ${TINT.mint}`}>
            <BookIcon className="size-5" />
          </span>
          <Heading>No lessons yet</Heading>
          <p className="m-0 max-w-sm text-sm text-muted">Your teacher’s lessons will appear here.</p>
        </div>
      )}

      {modules && modules.length > 0 && (
        <>
          {/* -mx-4/px-4 lets the scroller bleed to the screen edge on phones; it isn't spacing. */}
          <nav ref={lessonNav} aria-label="Lessons" className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <ol className="m-0 flex list-none gap-2 p-0">
              {modules.map((m, i) => (
                <li key={m.id}>
                  {/* Font utilities are `!` because of app.css's `button { font: inherit }` (see ui/styles.ts). */}
                  <button
                    type="button"
                    aria-current={m.id === currentId}
                    onClick={() => setCurrentId(m.id)}
                    className={`inline-flex h-9 items-center gap-2 rounded-full border border-border bg-surface pr-3.5 pl-2 text-[13px]! leading-none! font-medium! whitespace-nowrap text-ink transition hover:border-accent/60 hover:bg-surface-soft aria-[current=true]:border-ink aria-[current=true]:bg-ink aria-[current=true]:text-white aria-[current=true]:hover:bg-ink ${FOCUS_RING}`}
                  >
                    <span className={`grid size-6 place-items-center rounded-full font-mono text-[10px] ${m.id === currentId ? 'bg-white/15' : TINT.mint}`}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    {m.title}
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {/* Left: the lesson (reading and work interleaved, each exercise with its own editor). Right: the tutor,
              pinned under the top bar so it stays on screen while the lesson scrolls. */}
          <WorkspaceProvider moduleId={currentId}>
            <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
              <div className="min-w-0">
                <ModuleView module={current} index={Math.max(currentIndex, 0)} total={modules.length} />
              </div>
              {current && (
                <aside aria-label="Tutor" className="min-w-0 lg:sticky lg:top-24 lg:h-[calc(100dvh-7rem)]">
                  <AiChatPanel key={current.id} moduleId={current.id} />
                </aside>
              )}
            </div>
          </WorkspaceProvider>
        </>
      )}

      <section className={`flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between ${CARD}`}>
        <div className="flex flex-col gap-2">
          <Eyebrow>Join a classroom</Eyebrow>
          <Heading>Have a room code?</Heading>
          <p className="m-0 text-sm text-muted">Join another class with the code from your teacher.</p>
        </div>
        <form onSubmit={join} className="flex flex-wrap items-center gap-2">
          <input
            aria-label="Classroom join code"
            placeholder="Enter room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value)}
            required
            className={`${INPUT} h-10 w-52`}
          />
          <Button type="submit" variant="primary">
            Join class
          </Button>
          {joinMessage && <small className="basis-full text-xs text-muted">{joinMessage}</small>}
        </form>
      </section>
    </div>
  )
}
