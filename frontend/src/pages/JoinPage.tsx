import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { Role } from '../../../shared/types'
import { useAuth } from '../auth/useAuth.ts'
import Button from '../ui/Button.tsx'
import Heading from '../ui/Heading.tsx'
import { CARD } from '../ui/styles.ts'

const LOGIN_ROLE_KEY = 'loop-login-role'

function savedRole(): Role {
  return window.sessionStorage.getItem(LOGIN_ROLE_KEY) === 'teacher' ? 'teacher' : 'student'
}

function Brand() {
  return (
    <a href="/" aria-label="Loop home" className="flex items-center gap-2.5 font-display! text-xl! font-bold! tracking-[-0.06em]! text-ink">
      <img src="/favicon.svg" alt="" className="size-9" />
      <span>loop<span className="text-accent">.</span></span>
    </a>
  )
}

function RoleMark({ role }: { role: Role }) {
  return (
    <span className={`grid size-12 place-items-center rounded-2xl ${role === 'student' ? 'bg-mint text-mint-ink' : 'bg-lavender text-lavender-ink'}`} aria-hidden="true">
      {role === 'student' ? (
        <svg viewBox="0 0 24 24" fill="none" className="size-6"><path d="M12 3.5 14 9l5.5 2-5.5 2-2 5.5-2-5.5-5.5-2 5.5-2 2-5.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round"/><path d="m18.5 15 .9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" fill="currentColor"/></svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="size-6"><path d="M4 5.5h6.2c1 0 1.8.8 1.8 1.8v12c0-.9-.8-1.6-1.8-1.6H4v-12.2Zm16 0h-6.2c-1 0-1.8.8-1.8 1.8v12c0-.9.8-1.6 1.8-1.6H20V5.5Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round"/></svg>
      )}
    </span>
  )
}

export default function JoinPage() {
  const { session, user, loading, signInWithGoogle, joinClassroom, signOut } = useAuth()
  const [role, setRole] = useState<Role>(savedRole)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!session || user || loading) return
    let active = true
    setBusy(true)
    setError(null)
    void joinClassroom({ role })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not open your classroom')
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => { active = false }
  }, [session, user, loading, role, joinClassroom, attempt])

  if (loading) return <main className="grid min-h-svh place-content-center justify-items-center gap-3 bg-canvas font-mono text-xs text-muted"><img className="size-9" src="/favicon.svg" alt="" />Loading your classroom…</main>
  if (user) return <Navigate to={`/${user.role}`} replace />

  async function onGoogle() {
    setError(null)
    setBusy(true)
    window.sessionStorage.setItem(LOGIN_ROLE_KEY, role)
    try { await signInWithGoogle() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not start sign-in'); setBusy(false) }
  }

  const title = role === 'student' ? 'Student sign in' : 'Teacher sign in'
  return (
    <main className="flex min-h-svh flex-col bg-gradient-to-br from-mint/40 via-canvas to-lavender/40 px-5 text-ink">
      <header className="mx-auto flex h-16 w-full max-w-[400px] shrink-0 items-center"><Brand /></header>

      <div className="flex flex-1 items-center justify-center py-5">
        <section className={`${CARD} w-full max-w-[400px] overflow-hidden rounded-[24px]!`} aria-label={title}>
          <div className="h-1.5 bg-gradient-to-r from-accent via-mint to-lavender" />
          <div className="p-5 sm:p-7">
            <div className="mb-6 grid grid-cols-2 rounded-xl bg-surface-soft p-1" aria-label="Choose account type">
              <button type="button" onClick={() => { setRole('student'); window.sessionStorage.setItem(LOGIN_ROLE_KEY, 'student'); setError(null) }} aria-pressed={role === 'student'} className={`h-9 rounded-lg text-[13px]! font-semibold! transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${role === 'student' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>Student</button>
              <button type="button" onClick={() => { setRole('teacher'); window.sessionStorage.setItem(LOGIN_ROLE_KEY, 'teacher'); setError(null) }} aria-pressed={role === 'teacher'} className={`h-9 rounded-lg text-[13px]! font-semibold! transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${role === 'teacher' ? 'bg-surface text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>Teacher</button>
            </div>

            <div className="flex flex-col items-center text-center">
              <RoleMark role={role} />
              <Heading as="h1" variant="name" className="mt-4!">{session ? (role === 'student' ? 'Opening your class' : 'Setting up your classroom') : title}</Heading>
              <p className="pt-2 text-sm leading-6 text-muted">{session
                ? role === 'student' ? 'Getting your student home ready.' : 'Getting your teacher home ready.'
                : role === 'student' ? 'Pick up where your class left off.' : 'Your classroom is just a sign-in away.'}</p>
            </div>

            {!session ? <div className="mt-6 grid gap-3">
              {error && <p role="alert" className="rounded-xl border border-peach bg-peach px-3 py-2 text-sm text-peach-ink">{error}</p>}
              <Button onClick={onGoogle} disabled={busy} variant="default" size="lg" className="w-full justify-center rounded-xl! shadow-sm">
                <span className="font-bold! text-muted">G</span>{busy ? 'Opening Google…' : 'Continue with Google'}
              </Button>
              {role === 'student' && <p className="pt-1 text-center text-xs leading-5 text-muted">Use your school Google account.</p>}
            </div> : <div className="mt-6 grid gap-3">
              {busy && <div role="status" className="flex items-center justify-center gap-2 py-2 text-sm text-muted"><span className="size-4 animate-spin rounded-full border-2 border-border border-t-accent" />{role === 'student' ? 'Opening your class…' : 'Creating your classroom…'}</div>}
              {error && <p role="alert" className="m-0! rounded-xl border border-peach bg-peach px-3 py-2 text-sm text-peach-ink">{error}</p>}
              {error && <Button onClick={() => setAttempt((value) => value + 1)} variant="primary" size="lg" className="w-full">Try again</Button>}
              <Button onClick={() => void signOut()} variant="default" size="sm" className="w-full">Sign out</Button>
            </div>}
          </div>
        </section>
      </div>

      <footer className="mx-auto flex h-12 w-full max-w-[400px] shrink-0 items-center justify-between border-t border-ink/10 text-[11px] text-muted"><span>Loop Classroom</span><span>Learn by making <span className="text-accent">✦</span></span></footer>
    </main>
  )
}
