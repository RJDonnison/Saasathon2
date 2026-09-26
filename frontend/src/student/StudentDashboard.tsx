import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.ts'
import { useAuth } from '../auth/useAuth.ts'
import Button from '../ui/Button.tsx'
import Heading from '../ui/Heading.tsx'
import { CARD, TINT } from '../ui/styles.ts'
import { demoCourses, demoDueItems, demoNotices, demoTimetable, demoWeek } from './studentDemoData.ts'
import type { Classroom, Module } from '../../../shared/types'

export default function StudentDashboard({ demoPreview = false }: { demoPreview?: boolean }) {
  const { user } = useAuth()
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  const [showWeek, setShowWeek] = useState(false)
  const [showAllDue, setShowAllDue] = useState(false)
  useEffect(() => {
    if (!user || demoPreview) return
    let active = true
    void Promise.all([api.getClassroom(user.classroomId), api.listModules(user.classroomId)])
      .then(([room, lessonList]) => { if (active) { setClassroom(room); setModules(lessonList) } })
      .catch((error) => console.warn('Could not load current classroom:', error))
    return () => { active = false }
  }, [user, demoPreview])

  const firstName = demoPreview ? 'Sam' : user?.name.trim().split(/\s+/)[0] || 'there'
  const classPath = demoPreview ? '/student-demo/class/classroom-demo' : `/student/class/${user?.classroomId ?? 'demo'}`
  const liveTitle = classroom?.name ?? 'Digital Technologies'
  const courses = demoCourses.map((course, index) => index === 0 && classroom ? { ...course, name: classroom.name } : course)

  return (
    <div className="mx-auto flex max-w-[1020px] flex-col gap-6 sm:gap-7">
      <div className="pt-1">
        <p className="mb-1! text-[13px]! font-medium! text-muted">Tuesday, week 3 of term 4</p>
        <Heading as="h1" variant="title" className="text-[34px]! sm:text-[38px]!">Morning, {firstName}</Heading>
        <p className="mt-2! text-[15px]! text-muted">Five lessons today and four things due this week.</p>
      </div>

      <Link to={`${classPath}/live`} className="flex flex-col justify-between gap-5 rounded-2xl bg-ink p-6 text-white sm:flex-row sm:items-center sm:px-7 sm:py-6">
        <div>
          <span className={`mb-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${TINT.mint}`}><i className="mr-2 mt-1 size-1.5 rounded-full bg-mint-ink" />Live now</span>
          <h2 className="m-0! font-display! text-[24px]! leading-tight! font-semibold! tracking-[-0.03em]! text-white">{liveTitle} with Ms Patel</h2>
          <p className="mb-0! mt-2! text-sm! text-white/80">The class is on page 200, Problem B. Started 4 minutes ago in room D2.</p>
        </div>
        <Button variant="primary" size="lg" className="sm:min-w-[132px]">Join lesson</Button>
      </Link>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,.95fr)]">
        <section className={`${CARD} overflow-hidden`}>
            <header className="flex items-center justify-between px-5 pt-5 pb-3 sm:px-6">
            <Heading>{showWeek ? 'This week' : 'Today'}</Heading><button onClick={() => setShowWeek((week) => !week)} className="text-[13px] font-semibold text-mint-ink underline underline-offset-2">{showWeek ? 'Today' : 'Full week'}</button>
          </header>
          {showWeek ? <div className="grid gap-3 px-5 pb-5 sm:grid-cols-2 sm:px-6 xl:grid-cols-3">{demoWeek.map((day) => <article key={day.day} className="rounded-xl border border-border bg-surface-soft p-3"><strong className="text-[13px]">{day.day}</strong>{day.lessons.map((lesson) => <p key={lesson} className="mb-0! mt-2! border-t border-border pt-2 text-xs! text-muted">{lesson}</p>)}</article>)}</div> : <div className="px-4 pb-4 sm:px-5">
            {demoTimetable.map((row) => row.period ? (
              <div key={row.time} className={`grid grid-cols-[58px_minmax(0,1fr)] gap-3 border-t border-border px-2 py-3 sm:grid-cols-[72px_minmax(0,1fr)_auto] sm:gap-4 ${row.status === 'Live now' ? 'bg-surface-soft' : ''}`}>
                <div className="text-[13px] font-semibold">{row.time}<small className="mt-0.5 block text-xs font-normal text-muted">{row.period}</small></div>
                <div className="min-w-0"><strong className="text-[14px]">{row.subject}</strong><span className="ml-2 text-xs text-muted">{row.teacher}, {row.room}</span><p className="mb-0! mt-1! text-[13px]! text-ink">{row.topic}</p>{row.status && row.status !== 'Done' && row.status !== 'Live now' && <span className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${TINT.peach}`}>{row.status}</span>}</div>
                <span className={`hidden self-start text-xs text-muted sm:block ${row.status === 'Live now' ? `rounded-full px-2.5 py-1 font-semibold ${TINT.mint}` : ''}`}>{row.status}</span>
              </div>
            ) : <div key={row.time} className="grid grid-cols-[58px_1fr] gap-3 border-t border-border px-2 py-2 text-xs text-muted sm:grid-cols-[72px_1fr]">{row.time}<span>{row.subject}</span></div>)}
          </div>}
        </section>

        <div className="flex flex-col gap-4">
          <section className={`${CARD} p-5`}>
            <header className="mb-3 flex items-center justify-between"><Heading>Due</Heading><span className="text-xs text-muted">This week</span></header>
            {demoDueItems.slice(0, showAllDue ? undefined : 4).map((item) => <article key={item.title} className="border-t border-border py-3 first:border-0"><strong className="block text-[13px]">{item.title}</strong><span className="mt-1 block text-xs text-muted">{item.course}</span><div className="mt-1 flex items-center justify-between gap-2 text-xs"><span className={item.due.startsWith('Tomorrow') ? `rounded-full px-2 py-1 font-semibold ${TINT.peach}` : 'font-medium'}>{item.due}</span><span className="text-muted">{item.status}</span></div></article>)}
            <button onClick={() => setShowAllDue((all) => !all)} className="mt-2 text-[13px] font-semibold text-mint-ink underline underline-offset-2">{showAllDue ? 'Show less' : 'See all 6'}</button>
          </section>
          <section className={`${CARD} p-5`}>
            <Heading>From your teachers</Heading>
            {demoNotices.map((notice) => <article key={notice.course} className="mt-3 border-t border-border pt-3 first:border-0"><p className="mb-1! text-xs! text-muted">{notice.course}, {notice.teacher}</p><p className="mb-0! text-[13px]! leading-relaxed!">{notice.message}</p></article>)}
          </section>
        </div>
      </div>

      <section>
        <Heading className="mb-3">My classes</Heading>
        <div className={`${CARD} overflow-hidden`}>
          <div className="hidden grid-cols-[1.1fr_1.2fr_1.2fr_.4fr] gap-4 bg-surface-soft px-5 py-3 text-xs font-medium text-muted sm:grid"><span>Class</span><span>Last lesson</span><span>Next lesson</span><span>Due</span></div>
          {courses.map((course, index) => <Link key={course.name} to={classPath} className="grid grid-cols-[1fr_auto] items-center gap-2 border-t border-border px-4 py-3.5 first:border-0 hover:bg-surface-soft sm:grid-cols-[1.1fr_1.2fr_1.2fr_.4fr] sm:gap-4 sm:px-5">
            <span><strong className="block text-[14px]">{course.name}{course.live && <small className={`ml-2 rounded-full px-2 py-1 text-[10px] font-semibold ${TINT.mint}`}>Live</small>}</strong><small className="mt-0.5 block text-xs text-muted">{course.teacher}</small><small className="mt-1 block text-xs text-muted sm:hidden">Next: {course.next}</small></span>
            <span className="hidden text-[13px] sm:block">{index === 0 && modules.length ? `${modules[0].title} (today)` : course.last}</span><span className="hidden text-[13px] sm:block">{course.next}</span><span className="hidden text-[13px] font-semibold sm:block">{course.due}</span><span className="text-xl sm:hidden">›</span>
          </Link>)}
        </div>
        <p className="mb-0! mt-3! text-xs! text-muted">{demoPreview ? 'Demo preview: sample timetable, assignments and class activity.' : 'School timetable and due work shown as demo data. Your teacher manages your classroom access.'}</p>
      </section>
    </div>
  )
}
