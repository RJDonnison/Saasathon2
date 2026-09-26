import Avatar from '../ui/Avatar.tsx'
import Button from '../ui/Button.tsx'
import Card from '../ui/Card.tsx'
import { CheckIcon, HandIcon, XIcon } from '../ui/icons.tsx'
import { FOCUS_RING, TINT } from '../ui/styles.ts'

export interface RaisedHand {
  studentId: string
  at: number
}

// Live raised hands (the raise_hand socket listener lives in TeacherHome).
export default function RaiseHandAlert({
  hands,
  nameOf,
  onDismiss,
  onSelect,
}: {
  hands: RaisedHand[]
  nameOf: (studentId: string) => string
  onDismiss: (studentId: string) => void
  onSelect: (studentId: string) => void
}) {
  return (
    <Card
      title="Raised hands"
      eyebrow={hands.length ? `${hands.length} waiting` : 'All quiet'}
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
            return (
              <li key={h.studentId} className="flex items-center gap-3 rounded-xl bg-peach/40 p-2.5 pr-2">
                <button type="button" onClick={() => onSelect(h.studentId)} className={`flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left ${FOCUS_RING}`}>
                  <Avatar name={name} id={h.studentId} size="sm" />
                  <span className="min-w-0">
                    {/* Font utilities are `!` because of app.css's `button { font: inherit }` (see ui/styles.ts). */}
                    <span className="block truncate text-sm! font-semibold!">{name}</span>
                    <span className="block text-xs! font-normal! text-muted">
                      needs a hand · {new Date(h.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </span>
                </button>
                <Button size="icon-sm" onClick={() => onDismiss(h.studentId)} aria-label={`Dismiss ${name}'s raised hand`}>
                  <XIcon className="size-3.5" />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
