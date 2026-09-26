import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { api } from '../api.ts'
import type { Module, User } from '../../../shared/types'
import ClassroomGrid from './ClassroomGrid.tsx'
import StudentDetailPanel from './StudentDetailPanel.tsx'
import RaiseHandAlert from './RaiseHandAlert.tsx'

export default function TeacherHome() {
  const { user } = useAuth()
  const [students, setStudents] = useState<User[]>([])
  const [modules, setModules] = useState<Module[]>([])
  const [creating, setCreating] = useState(false)
  const [lesson, setLesson] = useState('')
  useEffect(() => { if (user) { api.getStudents(user.classroomId).then(setStudents).catch(() => setStudents([])); api.listModules(user.classroomId).then(setModules).catch(() => setModules([])) } }, [user])
  async function createClassroom() {
    const name = window.prompt('Name your classroom')
    if (!name?.trim()) return
    setCreating(true)
    try {
      const code = `LOOP${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const room = await api.createClassroom(name.trim(), code)
      window.alert(`Classroom created. Join code: ${room.roomCode}`)
      window.location.assign('/teacher')
    } catch (e) { window.alert(e instanceof Error ? e.message : 'Could not create classroom') }
    finally { setCreating(false) }
  }
  return <div className="dashboard">
    <section className="welcome-row teacher-welcome"><div><p className="dashboard-kicker">TEACHER DASHBOARD</p><h1>Your classroom, at a glance.</h1><p>See who is learning, where they need support, and what they are asking.</p></div><button className="app-button" disabled={creating} onClick={() => void createClassroom()}>{creating ? 'Creating…' : '＋ Create classroom'}</button></section>
    <section className="classroom-overview dashboard-card"><div className="section-heading"><div><p className="dashboard-kicker">MY CLASSROOMS</p><h2>Today’s class</h2></div><span className="live-label">DEMO CLASSROOM</span></div><div className="class-stats"><div><small>CLASS</small><strong>Demo Classroom</strong></div><div><small>STUDENTS</small><strong>{students.length}</strong></div><div><small>JOIN CODE</small><strong>DEMO123</strong></div><div><small>NEED HELP</small><strong>See live flags below</strong></div></div><div className="teacher-existing"><ClassroomGrid/></div></section>
    <div className="teacher-columns"><section className="dashboard-card"><p className="dashboard-kicker">LIVE ACTIVITY</p><h2>In the room now</h2><p className="muted-copy">Live help flags appear here as students raise a hand.</p><RaiseHandAlert/><StudentDetailPanel/></section><section className="dashboard-card lesson-planner"><p className="dashboard-kicker">LESSON PLANNER</p><h2>Plan a lesson</h2><label>Topic<input value={lesson} onChange={e => setLesson(e.target.value)} placeholder="For example, loops and repetition"/></label><label>Level<select defaultValue="beginner"><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label><button className="app-button" onClick={() => window.alert('Lesson drafting needs the AI lesson service, which is not connected yet.')}>Draft lesson plan</button><p className="small-note">AI lesson planning is not connected in this demo yet. Current lessons: {modules.length}.</p></section></div>
    <section className="dashboard-card ai-settings"><p className="dashboard-kicker">AI HELPER</p><h2>Guide the way students learn</h2><p className="muted-copy">The student helper currently returns a demo hint. Classroom-specific settings need an AI service and storage before they can affect its system prompt.</p><div className="settings-preview"><label><input type="radio" name="strictness" defaultChecked/> Hints only</label><label><input type="radio" name="strictness"/> Explanations allowed</label><label>Focus topics<input placeholder="Variables, loops, functions" disabled/></label><label>Custom instruction<input placeholder="Add a classroom note" disabled/></label></div></section>
  </div>
}
