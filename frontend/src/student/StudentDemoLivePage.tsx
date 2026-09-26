import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import Button from '../ui/Button.tsx'
import Heading from '../ui/Heading.tsx'
import { CARD, INPUT, TINT } from '../ui/styles.ts'

const starterCode = 'total = 0\nfor i in range(5):\n    score = input("Score: ")\n    total = total + score\n\nprint("Average:", total / 5)'

export default function StudentDemoLivePage() {
  const [phase, setPhase] = useState<'teach' | 'work'>('work')
  const [code, setCode] = useState(starterCode)
  const [output, setOutput] = useState('Score: 80\nAverage: 80')
  const [question, setQuestion] = useState('')
  const [handRaised, setHandRaised] = useState(false)
  const [messages, setMessages] = useState(['Try checking what type input() gives back.'])

  function sendQuestion(event: FormEvent) {
    event.preventDefault()
    if (!question.trim()) return
    setMessages((items) => [...items, 'Demo hint: inspect the value you are adding, then test one small change.'])
    setQuestion('')
  }

  return (
    <div className="mx-auto max-w-[1440px]">
      <header className="mb-5 flex flex-wrap items-center gap-4 border-b border-border pb-4">
        <Link to="/student-demo"><Button>‹ &nbsp; Home</Button></Link>
        <div className="min-w-0"><Heading>Digital Technologies</Heading><p className="mb-0! mt-1! text-xs! text-muted">Ms Patel, room D2</p></div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${TINT.mint}`}>● &nbsp; Live demo, 24 in class</span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs text-muted">Lesson phase</span>
          <div className="flex rounded-xl border border-border bg-surface-soft p-1">
            <button onClick={() => setPhase('teach')} aria-pressed={phase === 'teach'} className={`rounded-lg px-3 py-2 text-xs font-semibold ${phase === 'teach' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>Teach</button>
            <button onClick={() => setPhase('work')} aria-pressed={phase === 'work'} className={`rounded-lg px-3 py-2 text-xs font-semibold ${phase === 'work' ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>Work time</button>
          </div>
          <Button onClick={() => setHandRaised((raised) => !raised)} variant={handRaised ? 'peach' : 'default'}>{handRaised ? 'Hand raised' : 'Ask for help'}</Button>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[220px_minmax(0,1fr)_300px]">
        <aside className="flex flex-col gap-4">
          <section className={`rounded-xl p-4 ${TINT.mint}`}><strong className="block text-sm">Following Ms Patel</strong><p className="mb-0! mt-1! text-xs!">Your class follows the teacher’s lesson in this preview.</p></section>
          <section className={`${CARD} p-4`}><Heading>Today’s lesson</Heading><ol className="mb-0! mt-4! flex list-none flex-col gap-4 p-0 text-[13px]">{['Recap: while loops', 'Page 200: for loops', 'Problem A', 'Problem B', 'Problem C'].map((item, i) => <li key={item} className={`flex items-center gap-3 ${i === 3 ? 'font-semibold text-ink' : 'text-muted'}`}><span className={`grid size-7 place-items-center rounded-full text-[11px] ${i === 3 ? 'bg-accent text-ink' : 'bg-surface-soft'}`}>{i + 1}</span>{item}</li>)}</ol></section>
        </aside>

        <main className="min-w-0">
          <section className={`${CARD} mb-4 p-5 sm:p-6`}>
            <div className="mb-3 flex flex-wrap items-center gap-3"><span className="rounded-lg bg-surface-soft px-3 py-1.5 text-xs font-semibold">Page 200</span><span className="text-xs text-muted">Year 11 Digital Technologies workbook</span></div>
            <Heading as="h1" variant="title">Problem B</Heading>
            <p className="mb-0! mt-3! text-[14px]! leading-relaxed!">Write a program that asks for five test scores, one at a time, then prints the average. Use a for loop instead of five separate input lines.</p>
          </section>
          <section className={`${CARD} overflow-hidden`}>
            <div className="flex items-center justify-between border-b border-border bg-surface-soft px-4 py-3"><span className="font-mono text-xs">problem_b.py</span><Button variant="primary" onClick={() => setOutput('Score: 80\nAverage: 80')}>▶ &nbsp; Run</Button></div>
            <label className="sr-only" htmlFor="demo-code">Edit your Python code</label>
            <textarea id="demo-code" spellCheck={false} value={code} onChange={(event) => setCode(event.target.value)} className="min-h-[280px] w-full resize-y border-0 bg-surface p-5 font-mono text-[13px] leading-7 text-ink focus:outline-none" />
            <div className="border-t border-border bg-surface-soft p-4"><strong className="text-xs text-muted">Output · simulated in preview</strong><pre className="mb-0! mt-2! whitespace-pre-wrap font-mono text-xs! leading-relaxed!">{output}</pre></div>
          </section>
          {handRaised && <p className={`mb-0! mt-3! rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>Demo only: your hand is raised on screen. No teacher is connected to this preview.</p>}
        </main>

        <aside className={`${CARD} flex min-h-[420px] flex-col overflow-hidden`}>
          <header className="border-b border-border px-4 py-4"><div className="flex items-center justify-between"><Heading>Helper</Heading><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${TINT.lavender}`}>Hints only</span></div><p className="mb-0! mt-2! text-xs! text-muted">A small example of a guiding hint, not a finished answer.</p></header>
          <div className="flex-1 space-y-3 p-4">{messages.map((message, index) => <p key={`${index}-${message}`} className={`mb-0! max-w-[92%] rounded-xl p-3 text-[13px]! leading-relaxed! ${index % 2 ? 'ml-auto bg-lavender' : 'bg-surface-soft'}`}>{message}</p>)}</div>
          <form onSubmit={sendQuestion} className="flex gap-2 border-t border-border bg-surface-soft p-3"><input className={`${INPUT} h-10 min-w-0 flex-1`} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={phase === 'teach' ? 'Helper paused during teaching' : 'Ask for a hint'} disabled={phase === 'teach'} /><Button type="submit" variant="primary" disabled={phase === 'teach' || !question.trim()}>Send</Button></form>
          <p className="mb-0! px-4 pb-3! text-[11px]! text-muted">Demo preview only. AI and teacher activity are not connected.</p>
        </aside>
      </div>
    </div>
  )
}
