import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'
import type { Role } from '../../../shared/types'

export default function JoinPage() {
  const { session, user, loading, signInWithGoogle, joinClassroom, signOut } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<Role>(() => (sessionStorage.getItem('loop-role') as Role) || 'student')
  const [roomCode, setRoomCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  if (loading) return <main className="landing-loading">Getting your classroom ready…</main>
  if (user) return <Navigate to={`/${user.role}`} replace />
  const chooseRole = (next: Role) => { setRole(next); sessionStorage.setItem('loop-role', next) }
  async function enter(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    try {
      const joined = await joinClassroom({ roomCode, role })
      sessionStorage.removeItem('loop-role')
      navigate(`/${joined.role}`, { replace: true })
    } catch (err) { setError(err instanceof Error ? err.message : 'Could not join this classroom'); setBusy(false) }
  }
  async function google() {
    setBusy(true); setError('')
    try { await signInWithGoogle() } catch (err) { setError(err instanceof Error ? err.message : 'Could not start sign-in'); setBusy(false) }
  }
  return <main className="landing-page">
    <header className="landing-header"><a className="landing-brand" href="/">loop<span>.</span></a><span>CODING, TOGETHER</span></header>
    <section className="landing-hero">
      <p className="landing-eyebrow">A CLASSROOM WHERE EVERYONE CAN MAKE</p>
      <h1>AI that teaches, not cheats.<br/><span>Your teacher stays in the loop.</span></h1>
      <p className="landing-lede">Build real coding skills with helpful hints, a live teacher, and room to figure things out for yourself.</p>
      <div className="landing-choices"><button className={role === 'student' ? 'choice selected' : 'choice'} onClick={() => chooseRole('student')}>I’m a student</button><button className={role === 'teacher' ? 'choice selected' : 'choice'} onClick={() => chooseRole('teacher')}>I’m a teacher</button></div>
    </section>
    <section className="how-section"><p className="landing-eyebrow">HOW IT WORKS</p><div className="how-grid"><article><span>01</span><h2>Try an idea</h2><p>Students write and run code in their classroom.</p></article><article><span>02</span><h2>Get a nudge</h2><p>The AI helper guides the next step without giving away the answer.</p></article><article><span>03</span><h2>Learn together</h2><p>Teachers see questions live and can jump in when someone needs help.</p></article></div></section>
    <section className="access-panel" id="get-started"><div><p className="landing-eyebrow">GET STARTED AS A {role.toUpperCase()}</p><h2>Come join your classroom.</h2><p>Choose your role above, sign in, then enter the room code from your teacher.</p></div><div className="access-actions">{!session ? <button className="app-button" onClick={google} disabled={busy}>{busy ? 'Opening sign-in…' : 'Continue with Google'}</button> : <form onSubmit={enter} className="room-form"><label htmlFor="room-code">CLASSROOM CODE</label><input id="room-code" value={roomCode} onChange={e => setRoomCode(e.target.value)} placeholder="For example, DEMO123" required/><button className="app-button" disabled={busy}>{busy ? 'Joining…' : 'Join as ' + role}</button><button type="button" className="text-button" onClick={() => void signOut()}>Sign out</button></form>}{error && <p className="error-message">{error}</p>}</div></section>
    <footer className="landing-footer"><a className="landing-brand" href="/">loop<span>.</span></a><span>Make room for big ideas.</span><span>© 2026 Loop Classroom</span></footer>
  </main>
}
