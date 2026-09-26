import { TINT, type Tint } from './styles.ts'

const TINTS: Tint[] = ['mint', 'peach', 'lavender']
const SIZE = { sm: 'size-7 text-[11px]', md: 'size-[38px] text-[13px]', lg: 'size-[60px] text-xl' } as const

/** Stable pastel tint per id, so a person keeps the same colour everywhere. */
function tintFor(id: string): Tint {
  let h = 0
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length]
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export default function Avatar({ name, id, size = 'md' }: { name: string; id: string; size?: keyof typeof SIZE }) {
  return (
    <span aria-hidden="true" className={`inline-grid flex-none place-items-center rounded-full leading-none font-bold tracking-wide ${SIZE[size]} ${TINT[tintFor(id)]}`}>
      {initials(name)}
    </span>
  )
}
