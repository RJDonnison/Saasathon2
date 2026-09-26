import Avatar from '../ui/Avatar.tsx'
import Card from '../ui/Card.tsx'
import Dot from '../ui/Dot.tsx'
import Eyebrow from '../ui/Eyebrow.tsx'
import Heading from '../ui/Heading.tsx'
import { CodeIcon, PencilIcon, BookIcon } from '../ui/icons.tsx'
import type { User } from '../../../shared/types'

// PLACEHOLDER: real version shows the selected student's progress, code submissions and comments.
const COMING = [
  { label: 'Lesson progress', icon: <BookIcon className="size-4" /> },
  { label: 'Code submissions', icon: <CodeIcon className="size-4" /> },
  { label: 'Comments', icon: <PencilIcon className="size-4" /> },
]

export default function StudentDetailPanel({ student, online }: { student: User | null; online: boolean }) {
  return (
    <Card title="Student detail" eyebrow="Focus" icon={<BookIcon className="size-[18px]" />} tint="mint">
      {!student ? (
        <p className="m-0 py-4 text-center text-sm text-muted">Select a student to see how they’re getting on.</p>
      ) : (
        <div className="flex flex-col gap-5">
          <div className="flex items-center gap-4">
            <Avatar name={student.name} id={student.id} size="lg" />
            <div className="flex min-w-0 flex-col gap-1.5">
              <Heading as="h3" variant="name" className="truncate">
                {student.name}
              </Heading>
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Dot live={online} />
                {online ? 'Online now' : 'Offline'}
              </span>
            </div>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {COMING.map((c) => (
              <li key={c.label} className="flex items-center gap-3 rounded-xl border border-dashed border-border px-3.5 py-3 text-sm text-muted">
                <span className="text-subtle">{c.icon}</span>
                <span className="flex-1">{c.label}</span>
                <Eyebrow>Coming soon</Eyebrow>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}
