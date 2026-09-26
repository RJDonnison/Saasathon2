import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { plural, STATUS_LABEL, timeAgo } from '../student/lessons.ts'
import Avatar from '../ui/Avatar.tsx'
import Card from '../ui/Card.tsx'
import Dot from '../ui/Dot.tsx'
import Heading from '../ui/Heading.tsx'
import { BookIcon } from '../ui/icons.tsx'
import { TINT } from '../ui/styles.ts'
import type { Module, ProgressStatus, TeacherStudentAggregate, User } from '../../../shared/types'

const STATUS_TINT: Record<ProgressStatus, string> = { not_started: 'bg-surface-soft text-muted', in_progress: TINT.peach, completed: TINT.mint }

/** The selected student's real lesson progress and code runs, from the teacher aggregate endpoint. */
export default function StudentDetailPanel({
  student,
  online,
  classroomId,
  lessons,
}: {
  student: User | null
  online: boolean
  classroomId: string
  lessons: Module[]
}) {
  const [data, setData] = useState<{ studentId: string; aggregate: TeacherStudentAggregate | null } | null>(null)
  const studentId = student?.id

  useEffect(() => {
    if (!studentId) return
    let active = true
    const load = () =>
      api
        .getTeacherStudentAggregate(classroomId, studentId)
        .then((aggregate) => active && setData({ studentId, aggregate }))
        .catch(() => active && setData({ studentId, aggregate: null }))
    void load()
    const interval = window.setInterval(() => void load(), 20000)
    return () => {
      active = false
      window.clearInterval(interval)
    }
  }, [classroomId, studentId])

  const aggregate = data && data.studentId === studentId ? data.aggregate : null
  const loading = !!student && (!data || data.studentId !== studentId)
  const statusOf = (moduleId: string): ProgressStatus => aggregate?.moduleProgress.find((p) => p.moduleId === moduleId)?.status ?? 'not_started'
  const runs = [...(aggregate?.submissions ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const done = lessons.filter((l) => statusOf(l.id) === 'completed').length
  return (
    <Card title="Student detail" icon={<BookIcon className="size-[18px]" />} tint="mint">
      {!student ? (
        <p className="m-0 py-4 text-center text-sm text-muted">Select a student to see how they’re getting on.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar name={student.name} id={student.id} size="lg" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Heading as="h3" variant="name" className="truncate">{student.name}</Heading>
              <span className="flex items-center gap-1.5 text-xs text-muted"><Dot live={online} />{online ? 'Online now' : 'Offline'}</span>
            </div>
          </div>

          {loading ? (
            <div className="h-24 animate-pulse rounded-xl bg-surface-soft motion-reduce:animate-none" aria-busy="true" />
          ) : !aggregate ? (
            <p className="m-0 text-sm text-muted">Couldn’t load this student’s work.</p>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                {lessons.length === 0 ? (
                  <p className="m-0 text-sm text-muted">No lessons yet.</p>
                ) : (
                  <>
                    <p className="m-0 text-sm">{done} of {plural(lessons.length, 'lesson')} complete</p>
                    <ul className="m-0 flex list-none flex-col p-0">
                      {lessons.map((l) => (
                        <li key={l.id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-[13px] first:border-0">
                          <span className="min-w-0 truncate">{l.title}</span>
                          <span className={`flex-none rounded-full px-2.5 py-1 text-[11px] font-semibold ${STATUS_TINT[statusOf(l.id)]}`}>{STATUS_LABEL[statusOf(l.id)]}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>

              <div className="flex flex-col gap-2">
                {runs.length === 0 ? (
                  <p className="m-0 text-sm text-muted">No code runs yet.</p>
                ) : (
                  <>
                    <p className="m-0 text-sm">{plural(runs.length, 'run')} in total, last {timeAgo(runs[0].createdAt)}</p>
                    <ul className="m-0 flex list-none flex-col p-0">
                      {runs.slice(0, 4).map((run) => (
                        <li key={run.id} className="flex items-center justify-between gap-3 border-t border-border py-2 text-[13px] first:border-0">
                          <span className="text-muted">{timeAgo(run.createdAt)}</span>
                          <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${run.passed === false ? TINT.peach : TINT.mint}`}>{run.passed === false ? 'Error' : 'Worked'}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  )
}
