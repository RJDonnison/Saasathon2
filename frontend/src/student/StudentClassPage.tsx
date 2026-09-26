import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.ts'
import { useAuth } from '../auth/useAuth.ts'
import Button from '../ui/Button.tsx'
import Heading from '../ui/Heading.tsx'
import { CARD, TINT } from '../ui/styles.ts'
import { demoLessonLog } from './studentDemoData.ts'
import type { Classroom, Module } from '../../../shared/types'

export default function StudentClassPage() {
  const { classroomId = '' } = useParams()
  const { user } = useAuth()
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [modules, setModules] = useState<Module[]>([])
  useEffect(() => {
    if (!user) return
    let active = true
    void Promise.all([api.getClassroom(user.classroomId), api.listModules(user.classroomId)])
      .then(([room, list]) => { if (active) { setClassroom(room); setModules(list) } })
      .catch((error) => console.warn('Could not load class overview:', error))
    return () => { active = false }
  }, [user])

  const title = classroom?.name ?? 'Digital Technologies'
  const classPath = `/student/class/${classroomId || user?.classroomId || 'demo'}`
  const currentModule = modules[0]

  return (
    <div className="mx-auto max-w-[1020px]">
      <header className="mb-6 flex items-center gap-4 border-b border-border pb-4">
        <Link to="/student"><Button>‹ &nbsp; Home</Button></Link>
        <div className="min-w-0"><Heading>{title}</Heading><p className="mb-0! mt-1! text-xs! text-muted">Ms Patel, room D2</p></div>
      </header>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,.95fr)]">
        <div className="flex flex-col gap-5">
          <section className={`${CARD} p-5 sm:p-6`}>
            <Heading>Finish from class</Heading>
            <h3 className="mb-1! mt-3! font-display! text-[16px]! font-semibold!">Loops, Problems C and D</h3>
            <p className="mb-0! text-[13px]! text-muted">Set by Ms Patel on Tuesday. Due tomorrow, 3:00pm.</p>
            <p className="mb-0! mt-3! text-[14px]! leading-relaxed!">You solved A on your own and B with two hints. Your code for Problem C is saved where you left it.</p>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3"><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${TINT.lavender}`}>Helper at home: hints only, up to 3 per problem</span><Link to={`${classPath}/live`}><Button variant="primary" size="lg">Continue {currentModule?.title ? 'lesson' : 'Problem C'}</Button></Link></div>
          </section>
          <section>
            <Heading className="mb-3">Lesson log</Heading>
            <article className={`${CARD} p-5 sm:p-6`}>
              <p className="mb-1! text-xs! font-medium! text-muted">{demoLessonLog.date}</p>
              <h3 className="mb-4! font-display! text-[17px]! font-semibold!">{currentModule?.title ?? demoLessonLog.topic}</h3>
              <h4 className="mb-2! font-display! text-[13px]! font-semibold!">What the class went through</h4>
              <ol className="mb-5! flex list-none flex-wrap gap-2 p-0">{demoLessonLog.steps.map((step, i) => <li key={step} className="inline-flex items-center gap-2 rounded-full border border-border bg-surface-soft px-2.5 py-1.5 text-xs"><b className="grid size-5 place-items-center rounded-full bg-surface text-[10px]">{i + 1}</b>{step}</li>)}</ol>
              <h4 className="mb-2! font-display! text-[13px]! font-semibold!">From Ms Patel’s board</h4>
              <pre className="overflow-x-auto rounded-xl border border-border bg-surface-soft p-4 font-mono text-[13px] leading-relaxed text-muted">{demoLessonLog.board}</pre>
              <h4 className="mb-2! font-display! text-[13px]! font-semibold!">Your work</h4>
              {['Problem A|On your own', 'Problem B|With 2 hints', 'Problem C|Started'].map((item) => { const [name, status] = item.split('|'); return <div key={name} className="flex justify-between border-b border-border py-2.5 text-[13px]"><span>{name}</span><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${status === 'With 2 hints' ? TINT.lavender : TINT.mint}`}>{status}</span></div> })}
              <p className="mb-0! mt-3! text-xs! text-muted">You raised your hand once. Ms Patel helped you with line 4.</p>
              <div className={`mt-4 rounded-xl p-4 ${TINT.mint}`}><strong className="block text-xs">Takeaway</strong><p className="mb-0! mt-1! text-[13px]!">{demoLessonLog.takeaway}</p></div>
            </article>
            <article className={`${CARD} mt-3 flex items-center justify-between gap-3 p-4`}><div><p className="mb-1! text-xs! text-muted">Last Thursday, Period 3</p><strong className="text-[14px]">While loops: pages 194 to 199</strong><p className="mb-0! mt-1! text-xs! text-muted">5 steps. You solved 3 of 4 problems on your own.</p></div><Link to={`${classPath}/live`}><Button>Open lesson</Button></Link></article>
          </section>
        </div>
        <aside className="flex flex-col gap-4">
          <section className={`${CARD} p-5`}><Heading>Next lesson</Heading><h3 className="mb-1! mt-3! font-display! text-[16px]! font-semibold!">Thursday, Period 3</h3><p className="mb-0! text-xs! text-muted">Room D2</p><p className="mb-3! mt-3! text-[14px]!">Loops practice, pages 201 to 203</p><div className="rounded-xl bg-surface-soft p-3"><strong className="text-xs">From Ms Patel</strong><p className="mb-0! mt-1! text-[13px]!">Skip page 201 before class so we can start straight away.</p></div></section>
          <section className={`${CARD} p-5`}><Heading>Check yourself</Heading><p className="mb-3! mt-3! text-[14px]!">One question on Tuesday’s lesson. No helper, about 3 minutes.</p><details><summary className="inline-flex h-9 cursor-pointer list-none items-center rounded-[9px] border border-border bg-surface px-3 text-[13px] font-semibold hover:bg-surface-soft">Start check</summary><div className="mt-4 border-t border-border pt-3"><p className="text-[13px]">What number does <code className="rounded bg-surface-soft px-1">range(3)</code> start counting from?</p><div className="flex gap-2"><button className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-soft">1</button><button className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-soft">0</button><button className="rounded-lg border border-border px-3 py-2 text-xs hover:bg-surface-soft">3</button></div><p className="mb-0! mt-2! text-xs! text-muted">Try it in your own words, then check your notes.</p></div></details><p className="mb-0! mt-3! text-xs! text-muted">Last check, while loops: correct on your own.</p></section>
          <section className={`${CARD} p-5`}><Heading>Marks and submissions</Heading><p className="mb-0! mt-3! text-[13px]!">These stay in your school’s learning platform.</p></section>
          <p className="mb-0! text-xs! text-muted">Lesson log and schedule details are demo records until class planning data is connected.</p>
        </aside>
      </div>
    </div>
  )
}
