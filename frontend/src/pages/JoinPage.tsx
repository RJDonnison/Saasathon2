import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'
import InvitationList from '../student/InvitationList.tsx'
import type { Role } from '../../../shared/types'

function Arrow() {
  return <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>
}

export default function JoinPage() {
  const { session, user, loading, signInWithGoogle, createClassroom, signOut } = useAuth()
  const navigate = useNavigate()
  const [classroomName, setClassroomName] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <main className="landing-loading"><img className="loading-mark" src="/favicon.svg" alt="" /> Getting your workspace ready…</main>
  if (user) return <Navigate to={`/${user.role}`} replace />

  async function onGoogle() {
    setError(null); setBusy(true)
    try { await signInWithGoogle() }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not start Google sign-in'); setBusy(false) }
  }
  async function onCreate(e: FormEvent) {
    e.preventDefault(); setError(null); setBusy(true)
    try { const created = await createClassroom(classroomName.trim()); navigate(`/${created.role}`, { replace: true }) }
    catch (err) { setError(err instanceof Error ? err.message : 'Something went wrong'); setBusy(false) }
  }

  return (
    <main className="landing-shell">
      <div className="landing-grain" aria-hidden="true" />
      <nav className="landing-nav">
        <a className="brand" href="/" aria-label="Loop home"><img className="brand-icon" src="/favicon.svg" alt="" /><span>loop<span className="brand-dot">.</span></span></a>
        <a className="nav-cta" href="#get-started">Get started <Arrow /></a>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span>The classroom, rewired</span></div>
          <h1>Big ideas<br />start with <span className="headline-highlight">a line.</span></h1>
          <p className="hero-description">A creative coding classroom where students make, explore, and learn together.</p>
          <div className="hero-actions">
            <a className="button-primary" href="#get-started">Bring your class in <Arrow /></a>
            <span className="action-caption">For students and teachers</span>
          </div>
          <div className="hero-social-proof"><div className="avatar-stack"><span>J</span><span>M</span><span>A</span><span>+</span></div><p><strong>Made for the “what if?”</strong><br />moment in every student.</p></div>
        </div>

        <div className="hero-arrow" aria-hidden="true"><svg viewBox="0 0 120 54" fill="none"><path d="M5 27h96M79 5l22 22-22 22" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/></svg></div>
        <div className="hero-art" aria-label="A preview of students learning to code together">
          <div className="art-orbit orbit-one"/><div className="art-orbit orbit-two"/>
          <div className="spark spark-one">✳</div><div className="spark spark-two">✦</div>
          <div className="code-window">
            <div className="window-top"><div className="window-lights"><i/><i/><i/></div><span>first_project.js</span><span className="window-live"><i/> JAVASCRIPT</span></div>
            <div className="code-body"><div className="line-numbers">01<br/>02<br/>03<br/>04<br/>05<br/>06</div><div className="code-lines"><div><span className="code-purple">const</span> <span className="code-yellow">makeItReal</span> = () =&gt; {'{'}</div><div className="indent"><span className="code-purple">const</span> idea = <span className="code-green">"anything"</span>;</div><div className="indent"><span className="code-purple">return</span> <span className="code-blue">idea</span>.<span className="code-pink">create</span>();</div><div>{'};'}</div><div className="code-gap"/><div><span className="code-yellow">makeItReal</span>(); <span className="cursor"/> <span className="code-comment">// ready to explore</span></div></div></div>
            <div className="window-footer"><span><i className="success-dot"/> Ready to run</span><span>JavaScript <b>⌄</b></span></div>
          </div>
          <div className="float-card student-float"><span className="float-avatar avatar-coral">M</span><span><b>Maya just made</b><small>a tiny universe ✨</small></span><span className="float-heart">♥</span></div>
          <div className="float-card teacher-float"><span className="teacher-check">✓</span><span><b>Room 3 is buzzing</b><small>12 minds at work</small></span><span className="pulse-bars"><i/><i/><i/><i/><i/></span></div>
        </div>
      </section>

      <section className="feature-strip" aria-label="Classroom features">
        <div className="feature-item"><span className="feature-icon mint-icon">⌘</span><span><b>Make, don’t memorize</b><small>Hands-on coding from day one</small></span></div>
        <div className="feature-item"><span className="feature-icon peach-icon">↗</span><span><b>See every breakthrough</b><small>Teachers stay in the loop</small></span></div>
        <div className="feature-item"><span className="feature-icon lavender-icon">✳</span><span><b>Find their own way</b><small>Room to explore and experiment</small></span></div>
        <div className="strip-aside">GOOD THINGS HAPPEN<br/>WHEN WE MAKE THINGS.</div>
      </section>

      <section className="join-section" id="get-started">
        <div className="join-copy"><span className="section-kicker">GET STARTED</span><h2>Make room<br/>to <em>create.</em></h2><p>Sign in to create a classroom, or to accept your teacher’s invitation.</p></div>
        <div className="join-card">
          {!session ? <>
            <span className="card-step">01 <i/> YOUR WORKSPACE</span>
            <h3>Come on in.</h3><p className="card-description">Sign in with Google to join your classroom and get creating.</p>
            {error && <p className="form-error">{error}</p>}
            <button onClick={onGoogle} disabled={busy} className="google-button"><svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"/><path fill="#34A853" d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4.1 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.3A20 20 0 0 0 24 44Z"/><path fill="#4A90E2" d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.3H5.9a20 20 0 0 0 0 18.4l6.9-5.3Z"/><path fill="#EA4335" d="M24 11.9c3 0 5.6 1 7.7 3l5.8-5.8C34 5.7 29.5 4 24 4A20 20 0 0 0 5.9 14.8l6.9 5.3c1.6-4.7 6-8.2 11.2-8.2Z"/></svg>{busy ? 'Opening Google…' : 'Continue with Google'}<Arrow /></button>
            <p className="card-footnote">Students join by accepting an invitation from their teacher.</p>
          </> : <>
            <span className="card-step">02 <i/> YOUR CLASSROOM</span>
            <p className="card-description">Signed in as <strong>{(session.user.user_metadata?.full_name as string | undefined) ?? session.user.email}</strong>.</p>
            {role === 'student' ? <>
              <h3>Waiting for an invitation.</h3>
              <p className="card-description">Ask your teacher to invite this email address. Invitations show up here, and you choose whether to join.</p>
              <InvitationList />
              <div className="mt-5 flex flex-col items-start gap-3">
                <button type="button" onClick={() => setRole('teacher')} className="signout-link">Are you a teacher? Set up a classroom</button>
                <button type="button" onClick={() => void signOut()} className="signout-link">Sign out</button>
              </div>
            </> : <>
              <h3>Create your classroom</h3>
              <p className="card-description">Name it, then invite your students by email. They choose whether to join.</p>
              <form onSubmit={onCreate} className="join-form"><label>CLASSROOM NAME<input value={classroomName} onChange={(e) => setClassroomName(e.target.value)} placeholder="For example, Year 11 Digital Technologies" maxLength={80} required /></label>{error && <p className="form-error">{error}</p>}<button type="submit" disabled={busy} className="button-primary join-submit">{busy ? 'Creating…' : 'Create classroom'}<Arrow /></button></form>
              <button type="button" onClick={() => setRole('student')} className="signout-link">I’m a student</button>
              <button type="button" onClick={() => void signOut()} className="signout-link">Sign out</button>
            </>}
          </>}
          <div className="card-bottom"><span><i/> PRIVATE CLASSROOMS</span><span>MADE FOR LEARNING&nbsp; ✳</span></div>
        </div>
      </section>
      <footer className="landing-footer"><a className="brand footer-brand" href="#top"><img className="brand-icon" src="/favicon.svg" alt="" /><span>loop<span className="brand-dot">.</span></span></a><span>Make room for big ideas.</span><span>© 2026 LOOP CLASSROOM</span></footer>
    </main>
  )
}
