import type { ReactNode } from 'react'
import Heading from './Heading.tsx'
import { CARD, TINT, type Tint } from './styles.ts'

/** A titled card: coloured icon tile, heading, optional right-hand action. */
export default function Card({
  title,
  icon,
  tint = 'mint',
  action,
  className = '',
  bodyClassName = 'p-5',
  children,
}: {
  title: string
  icon?: ReactNode
  tint?: Tint
  action?: ReactNode
  className?: string
  bodyClassName?: string
  children: ReactNode
}) {
  return (
    <section className={`overflow-hidden ${CARD} ${className}`}>
      <header className="flex items-center gap-3 border-b border-border px-5 py-4">
        {icon && <span className={`grid size-9 flex-none place-items-center rounded-xl ${TINT[tint]}`}>{icon}</span>}
        <div className="flex min-w-0 flex-1">
          <Heading className="truncate">{title}</Heading>
        </div>
        {action}
      </header>
      <div className={bodyClassName}>{children}</div>
    </section>
  )
}
