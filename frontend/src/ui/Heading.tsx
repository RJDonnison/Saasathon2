import type { ReactNode } from 'react'
// Headings need the important modifier (`!`) to beat app.css's global h1/h2/h3 rules — see styles.ts.
const VARIANT = {
  title: 'text-[length:clamp(27px,3.4vw,36px)]! leading-[1.08]! tracking-[-0.035em]!',
  h2: 'text-[length:17px]! leading-[1.25]! tracking-[-0.02em]!',
  name: 'text-[length:21px]! leading-[1.2]! tracking-[-0.025em]!',
} as const

export default function Heading({
  as: Tag = 'h2',
  variant = 'h2',
  className = '',
  children,
}: {
  as?: 'h1' | 'h2' | 'h3'
  variant?: keyof typeof VARIANT
  className?: string
  children: ReactNode
}) {
  return <Tag className={`m-0! font-display! font-semibold! ${VARIANT[variant]} ${className}`}>{children}</Tag>
}
