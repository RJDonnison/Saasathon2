import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import Card from '../ui/Card.tsx'
import Eyebrow from '../ui/Eyebrow.tsx'
import Heading from '../ui/Heading.tsx'
import InlineText from '../ui/InlineText.tsx'
import Markdown from '../ui/Markdown.tsx'
import { BookIcon, CodeIcon, PencilIcon } from '../ui/icons.tsx'
import { CARD, INPUT, TINT } from '../ui/styles.ts'
import CodeEditor from './CodeEditor.tsx'
import type { Module, SectionBlock, StudentModule, StudentQuestion, StudentSection } from '../../../shared/types'

/** Only Markdown text blocks are authored today; a bare string of any other type is shown as text too. */
const blockText = (b: SectionBlock) => (typeof b.content === 'string' ? b.content : null)

/**
 * One lesson: the intro, then its sections in order. A section is reading (its content blocks) followed by work
 * (its questions and code exercises), so a lesson alternates between the two by how the teacher orders sections,
 * e.g. read -> practice -> read -> practice.
 */
export default function ModuleView({ module, index, total }: { module: Module | null; index: number; total: number }) {
  if (!module) {
    return (
      <section className={`${CARD} p-6`}>
        <p className="m-0 text-sm text-muted">No lesson selected.</p>
      </section>
    )
  }
  return <Lesson key={module.id} module={module} index={index} total={total} />
}

function Lesson({ module, index, total }: { module: Module; index: number; total: number }) {
  const [full, setFull] = useState<StudentModule | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    api
      .getModule(module.id)
      .then((m) => {
        if (!cancelled) setFull(m as StudentModule) // students always get the student aggregate
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load this lesson')
      })
    return () => {
      cancelled = true
    }
  }, [module.id])

  // Older intros start with a markdown "# Title" line that just repeats the heading.
  const intro = module.content.replace(/^#{1,6}[ \t]+.*\n+/, '').trim()
  const playgroundLanguage =
    full?.sections.flatMap((section) => section.questions).find((question) => question.codeExercise)?.codeExercise?.language ?? 'javascript'
  const playgroundCode = playgroundLanguage === 'python' ? 'print("Hello, Python!")' : 'console.log(1 + 2)'

  return (
    <div className="flex flex-col gap-6">
      <section className={`relative overflow-hidden ${CARD} p-6 sm:p-7`}>
        <div aria-hidden="true" className="pointer-events-none absolute -top-16 -right-16 size-48 rounded-full bg-accent/15 blur-2xl" />
        <div className="relative flex flex-col gap-5">
          <div className="flex items-start gap-4">
            <span className={`grid size-11 flex-none place-items-center rounded-2xl ${TINT.mint}`}>
              <BookIcon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-2.5">
              <Eyebrow>
                Lesson {String(index + 1).padStart(2, '0')} of {String(total).padStart(2, '0')}
              </Eyebrow>
              <Heading variant="title">{module.title}</Heading>
            </div>
          </div>
          {intro && (
            <p className="m-0 max-w-2xl text-[15px] leading-relaxed whitespace-pre-line text-muted">
              <InlineText text={intro} />
            </p>
          )}
        </div>
      </section>

      {error && <p className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>{error}</p>}

      {!full && !error && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the lesson">
          <div className="h-40 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
          <div className="h-56 animate-pulse rounded-2xl bg-surface-soft motion-reduce:animate-none" />
        </div>
      )}

      {full?.sections.map((section, i) => <SectionView key={section.id} section={section} index={i} />)}

      {full && (
        <CodeEditor
          editor={{ key: 'playground', label: 'the playground' }}
          filename="playground"
          language={playgroundLanguage}
          initialCode={playgroundCode}
          prompt="Playground"
          instructions="Try out anything from this lesson here. It isn’t part of an exercise."
        />
      )}
    </div>
  )
}

function SectionView({ section, index }: { section: StudentSection; index: number }) {
  const reading = section.blocks.filter((b) => blockText(b)?.trim())
  const work = section.questions
  const kind = reading.length && work.length ? 'Read & practise' : work.length ? 'Practise' : 'Read'
  return (
    <section aria-labelledby={`section-${section.id}`} className="flex flex-col gap-4">
      <header className="flex items-center gap-3">
        <span className={`grid size-8 flex-none place-items-center rounded-full font-mono text-[11px] ${work.length && !reading.length ? TINT.peach : TINT.mint}`}>
          {String(index + 1).padStart(2, '0')}
        </span>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Eyebrow>{kind}</Eyebrow>
          <h2 id={`section-${section.id}`} className="m-0! truncate font-display! text-[19px]! leading-tight! font-semibold! tracking-[-0.02em]!">
            {section.title}
          </h2>
        </div>
      </header>

      {reading.length > 0 && (
        <article className={`flex flex-col gap-6 p-6 sm:p-7 ${CARD}`}>
          {reading.map((b) => (
            <Markdown key={b.id} text={blockText(b)!} />
          ))}
        </article>
      )}

      {work.map((q) => (q.kind === 'code' && q.codeExercise ? <CodeQuestion key={q.id} question={q} /> : <AnswerQuestion key={q.id} question={q} />))}
    </section>
  )
}

/** "Write a function `double(n)` that returns…" -> a short, plain-text name for the exercise. */
const shortLabel = (prompt: string) => {
  const plain = prompt.replace(/`/g, '')
  return plain.length > 48 ? `${plain.slice(0, 47).trimEnd()}…` : plain
}

function CodeQuestion({ question }: { question: StudentQuestion }) {
  const ex = question.codeExercise!
  return (
    <CodeEditor
      editor={{ key: ex.id, label: shortLabel(question.prompt), exerciseId: ex.id }}
      filename="solution"
      language={ex.language}
      initialCode={ex.starterCode}
      prompt={question.prompt}
      instructions={ex.instructions}
    />
  )
}

// PLACEHOLDER: choices and answers stay in this browser tab; there is no attempts endpoint wired up yet.
function AnswerQuestion({ question }: { question: StudentQuestion }) {
  const [answer, setAnswer] = useState('')
  return (
    <Card title="Question" eyebrow="Check yourself" icon={<PencilIcon className="size-[18px]" />} tint="peach" bodyClassName="flex flex-col gap-4 p-5">
      <p className="m-0 text-[15px] leading-relaxed text-ink">
        <InlineText text={question.prompt} />
      </p>
      {question.kind === 'mcq' && question.options.length > 0 ? (
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="sr-only">Choose an answer</legend>
          {question.options.map((o) => (
            <label
              key={o.id}
              className="flex cursor-pointer items-center gap-3 rounded-[10px] border border-border bg-surface px-3.5 py-2.5 text-sm transition hover:bg-surface-soft has-checked:border-ink has-checked:bg-surface-soft"
            >
              <input type="radio" name={question.id} value={o.id} checked={answer === o.id} onChange={() => setAnswer(o.id)} className="accent-ink" />
              <InlineText text={o.text} />
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <label className="sr-only" htmlFor={`answer-${question.id}`}>
            Your answer
          </label>
          <input
            id={`answer-${question.id}`}
            className={`${INPUT} h-10 w-full`}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type your answer"
          />
        </>
      )}
      <p className="m-0 flex items-center gap-2 text-xs text-subtle">
        <CodeIcon className="size-3.5" />
        Answers aren’t submitted or checked yet.
      </p>
    </Card>
  )
}
