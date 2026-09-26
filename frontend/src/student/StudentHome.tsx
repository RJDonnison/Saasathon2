import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { api } from '../api.ts'
import type { Module } from '../../../shared/types'
import RaiseHandButton from './RaiseHandButton.tsx'

export default function StudentHome() {
  const { user, joinClassroom } = useAuth()
  const [modules, setModules] = useState<Module[]>([])
  const [code, setCode] = useState('')
  const [message, setMessage] = useState('')
  useEffect(() => { if (user) api.listModules(user.classroomId).then(setModules).catch(() => setModules([])) }, [user])
  async function join(e: React.FormEvent) {
    e.preventDefault()
    try { await joinClassroom({ roomCode: code, role: 'student' }); setMessage('You joined the classroom. Refreshing your dashboard…'); window.location.assign('/student') }
    catch (err) { setMessage(err instanceof Error ? err.message : 'Could not join this classroom') }
  }
  return <div className="dashboard">
    <section className="welcome-row"><div><p className="dashboard-kicker">YOUR LEARNING SPACE</p><h1>Welcome back, {user?.name.split(' ')[0]}.</h1><p>Choose a course or lesson to see what you’ll learn next.</p></div><div className="help-entry dashboard-help"><span>Need help in class?</span><RaiseHandButton /></div></section>
    <section className="dashboard-card join-class-card"><div><p className="dashboard-kicker">JOIN A CLASSROOM</p><h2>Have a room code?</h2><p>Join another class with the code from your teacher.</p></div><form onSubmit={join} className="inline-form"><input aria-label="Classroom join code" placeholder="Enter room code" value={code} onChange={e => setCode(e.target.value)} required/><button className="app-button">Join class</button>{message && <small>{message}</small>}</form></section>
    <section><div className="section-heading"><div><p className="dashboard-kicker">YOUR CLASSROOM</p><h2>My courses</h2></div></div><div className="module-cards"><article className="module-card course-card"><span>CLASSROOM COURSE</span><strong>Demo Classroom</strong><small>Teacher: Ms. Rivera</small><small>{modules.length} {modules.length === 1 ? 'lesson' : 'lessons'} available</small></article></div></section>
    <section><div className="section-heading"><div><p className="dashboard-kicker">COURSE CONTENT</p><h2>Learning modules</h2></div></div><div className="module-cards">{modules.length ? modules.map((m, i) => <article className="module-card" key={m.id}><span>LESSON {String(i + 1).padStart(2, '0')}</span><strong>{m.title}</strong><small className="module-status">Not started</small></article>) : <div className="module-card"><span>CLASSROOM</span><strong>No lessons yet</strong><small>Your teacher’s lessons will appear here.</small></div>}</div></section>
  </div>
}
