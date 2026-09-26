import Avatar from '../ui/Avatar.tsx'
import Button from '../ui/Button.tsx'
import Card from '../ui/Card.tsx'
import { CheckIcon, HandIcon } from '../ui/icons.tsx'
import { FOCUS_RING, TINT } from '../ui/styles.ts'
import type { RaisedHand } from '../../../shared/events'
import type { StudentActivitySnapshot } from '../../../shared/types'

// Live, server-owned raised hands (the listener lives in TeacherHome).
export default function RaiseHandAlert({
  hands,
  nameOf,
  onHelp,
  onSelect,
  activity,
}: {
  hands: RaisedHand[]
  nameOf: (studentId: string) => string
  onHelp: (studentId: string) => void
  onSelect: (studentId: string) => void
  activity: Record<string, StudentActivitySnapshot>
}) {
  return (
    <Card
      title="Raised hands"
      icon={<HandIcon className="size-[18px]" />}
      tint="peach"
      bodyClassName={hands.length ? 'p-3' : 'p-5'}
    >
      {hands.length === 0 ? (
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className={`grid size-8 flex-none place-items-center rounded-full ${TINT.mint}`}>
            <CheckIcon className="size-4" />
          </span>
          <p className="m-0">No one needs help right now.</p>
        </div>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-live="polite">
          {hands.map((h) => {
            const name = nameOf(h.studentId)
            const active = activity[h.studentId]?.active
            return (
              <li key={h.studentId} className="flex items-center gap-3 rounded-xl bg-peach/40 p-2.5 pr-2">
                <button type="button" onClick={() => onSelect(h.studentId)} className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left ${FOCUS_RING}`}>
                  <Avatar name={name} id={h.studentId} size="sm" />
                  <span className="min-w-0">
                    {/* Font utilities are `!` because of app.css's `button { font: inherit }` (see ui/styles.ts). */}
                    <span className="block truncate text-sm! font-semibold!">{name}</span>
                    <span className="block text-xs! font-normal! text-muted">
                      {active?.questionId
                        ? 'working on a question'
                        : `needs a hand · ${new Date(h.raisedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                    </span>
                  </span>
                </button>
                <Button size="sm" variant="primary" onClick={() => onHelp(h.studentId)}>
                  Help
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
