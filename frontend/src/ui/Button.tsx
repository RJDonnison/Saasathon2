import type { ButtonHTMLAttributes } from 'react'
import { FOCUS_RING, TINT } from './styles.ts'

// Font utilities are `!` because of app.css's `button { font: inherit }` — see styles.ts.
const BASE = `inline-flex items-center justify-center gap-2 rounded-[9px] border leading-none! font-semibold! whitespace-nowrap transition duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55 ${FOCUS_RING}`

const VARIANT = {
  default: 'border-border bg-surface text-ink enabled:hover:border-accent/60 enabled:hover:bg-surface-soft',
  primary: 'border-transparent bg-accent text-ink enabled:hover:brightness-95',
  peach: `border-transparent ${TINT.peach}`,
} as const

const SIZE = {
  md: 'h-[38px] px-3.5 text-[13px]!',
  sm: 'h-8 px-2.5 text-xs!',
  lg: 'h-11 px-4 text-[13px]!',
  icon: 'size-[38px] p-0 text-[13px]!',
  'icon-sm': 'size-8 p-0 text-xs!',
} as const

export default function Button({
  variant = 'default',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANT; size?: keyof typeof SIZE }) {
  return <button type={type} className={`${BASE} ${VARIANT[variant]} ${SIZE[size]} ${className}`} {...rest} />
}
