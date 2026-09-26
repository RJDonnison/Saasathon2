import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'
import { onPresenceUpdate } from '../socket.ts'
import { useLiveSession } from '../useLiveSession.ts'
import ModuleView from './ModuleView.tsx'
import AiChatPanel from './AiChatPanel.tsx'
import RaiseHandButton from './RaiseHandButton.tsx'
import { WorkspaceProvider } from './WorkspaceContext.tsx'
import Button from '../ui/Button.tsx'
import ClassTopBar from '../ui/ClassTopBar.tsx'
import Dot from '../ui/Dot.tsx'
import Eyebrow from '../ui/Eyebrow.tsx'
import Heading from '../ui/Heading.tsx'
import { BookIcon, CheckIcon } from '../ui/icons.tsx'
import { CARD, FOCUS_RING, TINT } from '../ui/styles.ts'
import { pickCurrent, plural } from './lessons.ts'
import { useClassData } from './useClassData.ts'

/**
 * The live lesson: top bar (class, phase, help), then three columns — the lesson list, the work, and the helper.
 * On large screens each column scrolls on its own so the helper stays put; on phones they stack.
 */
export default function StudentHome() {
  const { user } = useAuth()
  const { classroom, lessons: modules, error, setStatus } = useClassData()
  const [params] = useSearchParams()
  const [pickedId, setPickedId] = useState<string | null>(params.get('lesson'))
  const { session } = useLiveSession()
  // While the teacher's lesson is live, students follow it by default; they can wander off and come back.
  const [following, setFollowing] = useState(true)
  const [seenSession, setSeenSession] = useState<string | null>(null)
  if ((session?.id ?? null) !== seenSession) {
    setSeenSession(session?.id ?? null)
    setFollowing(true)
  }
  const [inClass, setInClass] = useState<number | null>(null)
  const lessonNav = useRef<HTMLElement>(null)

  // The lesson in view: the one the student picked (or linked to), else where they left off, else the first.
  const followedId = session && following && modules?.some((m) => m.id === session.moduleId) ? session.moduleId : null
  const currentId =
    followedId ??
    (pickedId && modules?.some((m) => m.id === pickedId) ? pickedId : null) ??
    (modules ? (pickCurrent(modules) ?? modules[0])?.id : null) ??
    null
  const followingNow = followedId !== null
  const phase = followingNow ? session!.phase : 'work'

  /** Pick a lesson from the list or the Next button. Leaving the teacher's lesson unfollows; returning to it re-follows. */
  function browse(id: string) {
    setPickedId(id)
    if (session) setFollowing(id === session.moduleId)
  }

  // Lock in the starting lesson (adjusting state during render) so marking one complete doesn't yank the student
  // onto the next.
  if (pickedId === null && modules?.length) setPickedId((pickCurrent(modules) ?? modules[0]).id)

  // Opening a lesson that hasn't been started marks it in progress.
  const currentStatus = modules?.find((m) => m.id === currentId)?.status
  useEffect(() => {
    if (currentId && currentStatus === 'not_started') setStatus(currentId, 'in_progress')
  }, [currentId, currentStatus, setStatus])

  // Live headcount from the classroom's presence broadcasts; unknown until the first one arrives.
  useEffect(
    () =>
      onPresenceUpdate((p) => {
        if (user && p.classroomId === user.classroomId) setInClass(p.onlineStudentIds.length)
      }),
    [user],
  )

  // Keep the active lesson visible in the list (matters when it scrolls or wraps on phones).
  useEffect(() => {
    lessonNav.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [currentId, modules])

  function imLost() {
    // The helper is paused while the teacher is teaching, so asking for help means stepping off their pace.
    if (followingNow && session!.phase === 'teach') setFollowing(false)
    // Wait a tick so the helper is mounted if it was paused.
    window.setTimeout(() => document.getElementById('helper-question')?.focus(), 0)
  }

  const currentIndex = modules?.findIndex((m) => m.id === currentId) ?? -1
  const current = currentIndex >= 0 ? modules![currentIndex] : null
  const doneCount = modules?.filter((m) => m.status === 'completed').length ?? 0
  const teacher = classroom?.teacherName ?? 'Your teacher'

  return (
    <div className="flex min-h-screen flex-col lg:h-screen">
      <ClassTopBar
        wide
        backTo="/student"
        title={classroom?.name ?? 'Your classroom'}
        subtitle={teacher}
        badge={
          inClass === null ? undefined : (
            <span className={`hidden items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap sm:inline-flex ${TINT.mint}`}>
              <Dot live />
              {inClass} in class now
            </span>
          )
        }
        center={
          session ? (
            <div className="flex items-center gap-3" role="status" aria-label="Lesson phase">
              <span className="hidden text-[13px] text-muted md:inline">Lesson phase</span>
              <div className="flex items-center gap-1 rounded-xl border border-border bg-surface-soft p-1">
                {(['teach', 'work'] as const).map((p) => (
                  <span
                    key={p}
                    aria-current={session.phase === p}
                    className={`rounded-lg px-3.5 py-2 text-[13px] leading-none font-semibold ${session.phase === p ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}
                  >
                    {p === 'teach' ? 'Teach' : 'Work time'}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <span className="rounded-full border border-border bg-surface-soft px-3 py-1.5 text-xs font-semibold text-muted">Self-paced</span>
          )
        }
        actions={
          <>
            <Button size="lg" onClick={imLost}>
              I’m lost
            </Button>
            <RaiseHandButton />
          </>
        }
      />

      <WorkspaceProvider moduleId={currentId}>
        <div className="grid min-h-0 flex-1 lg:grid-cols-[16.5rem_minmax(0,1fr)_22rem]">
          <aside ref={lessonNav} aria-label="Lessons" className="flex flex-col gap-6 border-b border-border p-5 lg:overflow-y-auto lg:border-r lg:border-b-0">
            {session && followingNow ? (
              <div className={`flex flex-col gap-1.5 rounded-xl p-4 ${TINT.mint}`}>
                <strong className="flex items-center gap-2 text-sm">
                  <Dot live /> Following {teacher}
                </strong>
                <p className="m-0 text-[13px] leading-snug">Your screen moves when they move on.</p>
              </div>
            ) : session ? (
              <div className={`flex flex-col gap-2 rounded-xl p-4 ${TINT.peach}`}>
                <strong className="text-sm">Working on your own</strong>
                <p className="m-0 text-[13px] leading-snug">{teacher} is teaching “{session.moduleTitle}”.</p>
                <Button size="sm" onClick={() => browse(session.moduleId)}>
                  Back to {teacher}
                </Button>
              </div>
            ) : (
              <div className={`flex flex-col gap-1.5 rounded-xl p-4 ${TINT.mint}`}>
                <strong className="text-sm">{teacher}’s class</strong>
                <p className="m-0 text-[13px] leading-snug">
                  {modules?.length ? `${doneCount} of ${plural(modules.length, 'lesson')} complete.` : 'No lessons yet.'} No lesson is live right now, so go at your own pace.
                </p>
              </div>
            )}
            <div className="flex flex-col gap-3">
              <Heading>{session ? 'Today’s lesson' : 'Lessons'}</Heading>
              {modules === null && !error ? (
                <div className="flex flex-col gap-2" aria-busy="true" aria-label="Loading lessons">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="h-11 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" />
                  ))}
                </div>
              ) : (
                <ol className="m-0 flex list-none flex-col gap-1 p-0">
                  {(modules ?? []).map((m, i) => (
                    <li key={m.id}>
                      {/* Font utilities are `!` because of app.css's `button { font: inherit }` (see ui/styles.ts). */}
                      <button
                        type="button"
                        aria-current={m.id === currentId}
                        onClick={() => browse(m.id)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px]! leading-tight! font-medium! text-muted transition hover:bg-surface-soft aria-[current=true]:bg-mint/70 aria-[current=true]:text-ink ${FOCUS_RING}`}
                      >
                        <span className="grid size-8 flex-none place-items-center rounded-full border border-border bg-surface text-[13px] font-semibold text-muted [[aria-current=true]>&]:border-transparent [[aria-current=true]>&]:bg-accent [[aria-current=true]>&]:text-ink">
                          {m.status === 'completed' ? <CheckIcon className="size-4" /> : i + 1}
                        </span>
                        <span className="flex min-w-0 flex-col gap-0.5">
                          <span className="truncate">{m.title}</span>
                          {session?.moduleId === m.id ? (
                            <span className="text-xs! font-medium! text-mint-ink">The class is here</span>
                          ) : (
                            m.id === currentId && <span className="text-xs! font-medium! text-mint-ink">You’re here</span>
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </aside>

          <main className="flex min-w-0 flex-col gap-4 p-4 sm:p-6 lg:overflow-y-auto">
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

            {modules && modules.length > 0 && <ModuleView module={current} index={Math.max(currentIndex, 0)} total={modules.length} />}

            {current && (
              <div className={`flex flex-wrap items-center justify-between gap-3 p-5 ${CARD}`}>
                <p className="m-0 text-sm text-muted">
                  {current.status === 'completed' ? 'You’ve marked this lesson as done.' : 'Finished the reading and exercises?'}
                </p>
                <div className="flex items-center gap-2">
                  {current.status === 'completed' ? (
                    <Button onClick={() => setStatus(current.id, 'in_progress')}>Reopen lesson</Button>
                  ) : (
                    <Button variant="primary" onClick={() => setStatus(current.id, 'completed')}>
                      <CheckIcon className="size-4" />
                      Mark lesson complete
                    </Button>
                  )}
                  {current.status === 'completed' && modules && modules[currentIndex + 1] && (
                    <Button variant="primary" onClick={() => browse(modules[currentIndex + 1].id)}>Next lesson</Button>
                  )}
                </div>
              </div>
            )}
          </main>

          {current && (
            <aside aria-label="Helper" className="flex min-h-[30rem] flex-col border-t border-border bg-surface lg:min-h-0 lg:overflow-hidden lg:border-t-0 lg:border-l">
              {phase === 'work' ? (
                <AiChatPanel moduleId={current.id} />
              ) : (
                <div className="flex flex-col gap-2 p-5">
                  <Eyebrow>Teach phase</Eyebrow>
                  <Heading>Helper paused</Heading>
                  <p className="m-0 text-sm text-muted">Follow along with {teacher}. The coding helper is available again during work time, or when you step off their pace.</p>
                </div>
              )}
            </aside>
          )}
        </div>
      </WorkspaceProvider>
    </div>
  )
}
