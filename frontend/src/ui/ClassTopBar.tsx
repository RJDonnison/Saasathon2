import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Heading from './Heading.tsx'
import { ChevronLeftIcon } from './icons.tsx'
import { FOCUS_RING } from './styles.ts'

/**
 * The white bar at the top of a class screen: a Home button, the class name with its teacher, optional badge,
 * a centred control and right-hand actions. `wide` lets it span the full screen (the live lesson); otherwise it
 * lines up with the ~1020px page column.
 */
export default function ClassTopBar({
  backTo,
  backLabel = 'Home',
  title,
  subtitle,
  badge,
  center,
  actions,
  wide = false,
}: {
  backTo: string
  backLabel?: string
  title: string
  subtitle?: string
  badge?: ReactNode
  center?: ReactNode
  actions?: ReactNode
  wide?: boolean
}) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className={`mx-auto flex w-full flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6 ${wide ? '' : 'max-w-[1020px]'}`}>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Link
            to={backTo}
            className={`inline-flex h-10 flex-none items-center gap-1.5 rounded-[9px] border border-border bg-surface pr-3.5 pl-2.5 text-[13px]! font-semibold! text-ink hover:bg-surface-soft ${FOCUS_RING}`}
          >
            <ChevronLeftIcon className="size-4" />
            {backLabel}
          </Link>
          <div className="flex min-w-0 flex-col gap-1">
            <Heading className="truncate">{title}</Heading>
            {subtitle && <p className="m-0 truncate text-xs text-muted">{subtitle}</p>}
          </div>
          {badge}
        </div>
        {center}
        {actions && <div className="flex flex-1 flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
    </header>
  )
}
