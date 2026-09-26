import Avatar from '../ui/Avatar.tsx'
import Button from '../ui/Button.tsx'
import Card from '../ui/Card.tsx'
import Dot from '../ui/Dot.tsx'
import Eyebrow from '../ui/Eyebrow.tsx'
import Heading from '../ui/Heading.tsx'
import { BookIcon, PencilIcon } from '../ui/icons.tsx'
import type { StudentActivity, StudentActivitySnapshot, User } from '../../../shared/types'

const label: Record<StudentActivity['type'], string> = {
  viewing_lesson: 'Opened the lesson',
  answering_question: 'Answering a question',
  checking_answer: 'Checked an answer',
  writing_code: 'Writing code',
  running_code: 'Ran their code',
  checking_code: 'Checked their code',
}

export default function StudentDetailPanel({
  student,
  online,
  activity,
  onOpenQuestion,
}: {
  student: User | null
  online: boolean
  activity?: StudentActivitySnapshot
  onOpenQuestion: (activity: StudentActivity) => void
}) {
  const current = activity?.active
  const currentWork = current?.questionId
    ? activity?.work.find((work) => work.questionId === current.questionId)
    : undefined
  return (
    <Card title="Student detail" eyebrow="Focus" icon={<BookIcon className="size-[18px]" />} tint="mint">
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

          {current ? (
            <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface-soft p-3.5">
              <Eyebrow>Currently</Eyebrow>
              <p className="m-0 text-sm font-medium text-ink">{label[current.type]}</p>
              {current.questionId && (
                <Button size="sm" variant="primary" onClick={() => onOpenQuestion(current)}>
                  <BookIcon className="size-3.5" /> Open current question
                </Button>
              )}
              {currentWork && (
                <p className="m-0 line-clamp-3 text-xs leading-relaxed text-muted font-mono">
                  {currentWork.code ?? currentWork.answer}
                </p>
              )}
            </div>
          ) : (
            <p className="m-0 rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted">No recent lesson activity yet.</p>
          )}

          <div className="flex flex-col gap-2">
            <Eyebrow>Recent activity</Eyebrow>
            {activity?.recent.length ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {activity.recent.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 rounded-xl border border-border px-3 py-2.5 text-sm">
                    <PencilIcon className="size-3.5 text-subtle" />
                    <span className="min-w-0 flex-1 truncate text-ink">{label[entry.type]}</span>
                    <span className="text-xs text-muted">{new Date(entry.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="m-0 text-sm text-muted">Activity will appear as they work.</p>
            )}
          </div>
        </div>
      )}
    </Card>
  )
}
