import Avatar from '../ui/Avatar.tsx'
import Card from '../ui/Card.tsx'
import Dot from '../ui/Dot.tsx'
import { UsersIcon } from '../ui/icons.tsx'
import { FOCUS_RING } from '../ui/styles.ts'
import type { User } from '../../../shared/types'

// Students (REST) with live online/offline state (socket presence_update, owned by TeacherHome).
// Per-student progress lives in StudentDetailPanel, which loads the selected student's aggregate.
export default function ClassroomGrid({
  students,
  online,
  selectedId,
  onSelect,
}: {
  students: User[] | null
  online: Set<string>
  selectedId: string | null
  onSelect: (id: string | null) => void
}) {
  // Online students first, then alphabetical.
  const sorted = [...(students ?? [])].sort(
    (a, b) => Number(online.has(b.id)) - Number(online.has(a.id)) || a.name.localeCompare(b.name),
  )
  return (
    <Card
      title="Students"
      eyebrow="Roll call"
      icon={<UsersIcon className="size-[18px]" />}
      tint="lavender"
      action={
        <span className="flex items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-2">
            <Dot live /> Online
          </span>
          <span className="flex items-center gap-2">
            <Dot /> Offline
          </span>
        </span>
      }
    >
      {students === null ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true" aria-label="Loading students">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-16 animate-pulse rounded-[14px] bg-surface-soft motion-reduce:animate-none" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <p className="m-0 py-8 text-center text-sm text-muted">No students have joined yet. Invite them from the panel above.</p>
      ) : (
        <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2">
          {sorted.map((s) => {
            const isOnline = online.has(s.id)
            return (
              <li key={s.id}>
                <button
                  type="button"
                  aria-pressed={selectedId === s.id}
                  onClick={() => onSelect(selectedId === s.id ? null : s.id)}
                  className={`flex w-full items-center gap-3 rounded-[14px] border border-border bg-surface p-3.5 text-left transition hover:-translate-y-px hover:border-accent/60 hover:shadow-[0_8px_22px_-14px_color-mix(in_srgb,var(--color-ink)_35%,transparent)] aria-pressed:border-accent aria-pressed:ring-3 aria-pressed:ring-accent/25 ${FOCUS_RING}`}
                >
                  <Avatar name={s.name} id={s.id} />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    {/* Font utilities are `!` because of app.css's `button { font: inherit }` (see ui/styles.ts). */}
                    <span className="block truncate text-sm! font-semibold!">{s.name}</span>
                    <span className="flex items-center gap-1.5 text-xs! font-normal! text-muted">
                      <Dot live={isOnline} />
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
