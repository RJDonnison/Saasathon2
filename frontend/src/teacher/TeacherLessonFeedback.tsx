import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.ts'
import Card from '../ui/Card.tsx'
import Heading from '../ui/Heading.tsx'
import { BookIcon, CheckIcon, UsersIcon } from '../ui/icons.tsx'
import { CARD, TINT } from '../ui/styles.ts'
import type { LessonFeedbackReport, LessonFeedbackStudentDetail } from '../../../shared/types'

const stamp = (value: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Not recorded'
const metric = (value: number | null) => value === null ? 'Not enough data' : `${value} min`
const STATUS: Record<string, string> = { completed: 'Finished', in_progress: 'In progress', not_started: 'Not started' }

function Flag({ children, good = false }: { children: string; good?: boolean }) {
  return <span className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${good ? TINT.mint : TINT.peach}`}>
    {good ? <CheckIcon className="size-3.5" /> : <span aria-hidden="true">!</span>}{children}
  </span>
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className={`${CARD} flex min-h-28 flex-col justify-between gap-3 p-4`}>
    <span className="text-xs font-medium text-muted">{label}</span>
    <div><strong className="font-display text-2xl font-semibold tracking-tight text-ink">{value}</strong><p className="m-0 text-xs text-muted">{note}</p></div>
  </div>
}

export default function TeacherLessonFeedback() {
  const { sessionId = '', studentId } = useParams()
  const [report, setReport] = useState<LessonFeedbackReport | null>(null)
  const [detail, setDetail] = useState<LessonFeedbackStudentDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const load = async () => {
      try {
        const summary = await api.getLessonFeedback(sessionId)
        if (!cancelled) setReport(summary)
        if (studentId) {
          const student = await api.getLessonStudentFeedback(sessionId, studentId)
          if (!cancelled) setDetail(student)
        } else if (!cancelled) setDetail(null)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load lesson feedback')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [sessionId, studentId])

  if (loading) return <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-5 sm:p-8" aria-busy="true"><div className="h-8 w-2/3 animate-pulse rounded-lg bg-surface-soft"/><div className="h-52 animate-pulse rounded-2xl bg-surface-soft"/></main>
  if (error || !report) return <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-5 sm:p-8"><Link to="/teacher" className="text-sm! font-medium! text-muted">← Teacher home</Link><Card title="Feedback unavailable"><p className="m-0 text-sm text-muted">{error ?? 'This ended lesson could not be found.'}</p></Card></main>

  if (studentId && detail) return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-5 pb-12 sm:p-8">
    <Link to={`/teacher/feedback/${encodeURIComponent(sessionId)}`} className="text-sm! font-medium! text-muted">← All students</Link>
    <header className="flex flex-col gap-2"><p className="m-0 text-sm font-medium text-mint-ink">Individual lesson feedback</p><Heading as="h1" variant="title">{detail.studentName}</Heading><p className="m-0 text-sm text-muted">{report.session.moduleTitle} · {report.classroomName} · {STATUS[detail.progress]}</p></header>
    {detail.redFlag && <div className={`flex flex-col gap-2 rounded-2xl p-4 ${TINT.peach}`}><strong className="text-sm">Needs teacher review</strong><p className="m-0 text-sm">{detail.redFlag}</p><p className="m-0 text-xs">Automated safety and misuse signals can be wrong. Review the conversation before acting.</p></div>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Lesson progress" value={STATUS[detail.progress]} note={detail.finishedAt ? `Finished ${stamp(detail.finishedAt)}` : 'Completion was not recorded'} />
      <Stat label="AI helper use" value={`${detail.aiUsePercent}%`} note={`${detail.aiHintCount} of ${detail.trackedActionCount} tracked actions`} />
      <Stat label="Following teacher screen" value={`${detail.followedPercent}%`} note={`${detail.detachCount} times stepped away`} />
      <Stat label="Time active" value={`${detail.activeMinutes} min`} note={`${detail.taskCount} tasks · ${detail.quizCount} quiz checks`} />
    </section>
    <Card title="Progress and next step" eyebrow="AI summary" icon={<BookIcon className="size-4" />}>
      <div className="flex flex-col gap-4"><p className="m-0 text-sm leading-relaxed text-ink">{detail.aiSummary}</p>{detail.greenFlag && <Flag good>{detail.greenFlag}</Flag>}<div className={`flex flex-col gap-2 rounded-xl p-4 ${TINT.lavender}`}><strong className="text-sm">A useful teacher check-in</strong><p className="m-0 text-sm">{detail.aiSuggestion}</p></div></div>
    </Card>
    <Card title="AI conversation log" eyebrow={`${detail.aiLogs.length} recorded turns`}>
      {detail.aiLogs.length ? <ol className="m-0 flex list-none flex-col gap-3 p-0">{detail.aiLogs.map((log, index) => <li key={`${log.askedAt}-${index}`} className="flex flex-col gap-2 rounded-xl border border-border p-4"><p className="m-0 text-xs text-muted">{stamp(log.askedAt)}</p><p className="m-0 whitespace-pre-wrap text-sm font-medium text-ink">Student: {log.question}</p><p className="m-0 whitespace-pre-wrap text-sm text-muted">Helper: {log.reply}</p>{(log.safetyFlags.length > 0 || log.misuse || !log.reviewAvailable) && <div className="flex flex-wrap gap-2">{log.safetyFlags.map((flag) => <Flag key={flag}>{`Review signal: ${flag.replace('_', ' ')}`}</Flag>)}{log.misuse && <Flag>{`Use signal: ${log.misuse.replace('_', ' ')}`}</Flag>}{!log.reviewAvailable && <Flag>Safety check unavailable. Review manually.</Flag>}</div>}</li>)}</ol> : <p className="m-0 text-sm text-muted">No AI-helper conversations were recorded during this lesson.</p>}
    </Card>
    <Card title="Lesson activity" eyebrow="Recorded events">
      {detail.activityTimeline.length ? <ol className="m-0 flex list-none flex-col gap-2 p-0">{detail.activityTimeline.map((item, index) => <li key={`${item.at}-${index}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm"><span className="text-ink">{item.type.replaceAll('_', ' ')}</span><span className="text-xs text-muted">{stamp(item.at)}</span></li>)}</ol> : <p className="m-0 text-sm text-muted">No learning activity was recorded.</p>}
    </Card>
  </main>

  return <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-5 pb-12 sm:p-8">
    <Link to="/teacher" className="text-sm! font-medium! text-muted">← Teacher home</Link>
    <header className="flex flex-col gap-2"><p className="m-0 text-sm font-medium text-mint-ink">Lesson complete · {report.classroomName}</p><Heading as="h1" variant="title">{report.session.moduleTitle}</Heading><p className="m-0 text-sm text-muted">{stamp(report.session.startedAt)} to {stamp(report.session.endedAt)} · {report.session.durationMinutes} minutes</p></header>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Class completion" value={`${report.completedCount}/${report.studentCount}`} note="students with completion recorded" />
      <Stat label="Used AI hints" value={`${report.helperUsePercent}%`} note="of enrolled students used the helper" />
      <Stat label="Followed teacher screen" value={`${report.followedPercent}%`} note="of total roster lesson time observed" />
      <Stat label="Average finish time" value={metric(report.averageFinishMinutes)} note={`Quiz check average: ${metric(report.averageQuizMinutes)}`} />
    </section>
    <Card title="How the class went" eyebrow="AI class summary" icon={<UsersIcon className="size-4" />}>
      <div className="flex flex-col gap-4"><p className="m-0 text-sm leading-relaxed text-ink">{report.aiSummary}</p><div className="flex flex-wrap gap-2"><Flag good>{`${report.independentCount} worked without recorded helper use`}</Flag>{report.strengths.map((strength, index) => <Flag key={`${index}-${strength}`} good>{strength}</Flag>)}</div></div>
    </Card>
    <Card title="Students to check in with" eyebrow="Suggested attention">
      {report.attentionSuggestions.length ? <ul className="m-0 flex list-none flex-col gap-3 p-0">{report.attentionSuggestions.map((suggestion) => <li key={suggestion.studentId} className="flex flex-col gap-1 rounded-xl p-3 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm font-semibold text-ink">{suggestion.studentName}</span><span className="text-sm text-muted">{suggestion.reason}</span></li>)}</ul> : <p className="m-0 text-sm text-muted">No specific follow-up was suggested from the recorded activity.</p>}
    </Card>
    <Card title="Student feedback" eyebrow={`${report.students.length} students`}>
      {report.students.length ? <ul className="m-0 flex list-none flex-col gap-3 p-0">{report.students.map((student) => <li key={student.studentId}><Link to={`/teacher/feedback/${encodeURIComponent(sessionId)}/students/${encodeURIComponent(student.studentId)}`} className="flex flex-col gap-3 rounded-xl border border-border p-4 text-ink! no-underline! transition hover:bg-surface-soft sm:flex-row sm:items-center"><div className="flex min-w-0 flex-1 flex-col gap-1"><strong className="block truncate text-sm">{student.studentName}</strong><p className="m-0 text-sm text-muted">{student.aiSummary}</p></div><div className="flex flex-wrap items-center gap-2"><span className="text-xs text-muted">{STATUS[student.progress]} · {student.aiUsePercent}% AI · {student.followedPercent}% follow</span>{student.greenFlag && <Flag good>{student.greenFlag}</Flag>}{student.redFlag && <Flag>{student.redFlag}</Flag>}<span aria-hidden="true" className="text-muted">→</span></div></Link></li>)}</ul> : <p className="m-0 text-sm text-muted">There were no students enrolled in this class when the report was opened.</p>}
    </Card>
    <p className="m-0 text-xs text-muted">AI feedback is based on lesson activity the app recorded. “Worked without helper use” only means no AI helper request was recorded here. Safety flags are review signals and are not proof of intent.</p>
  </main>
}
