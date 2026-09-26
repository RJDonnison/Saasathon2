import type { ReactNode } from 'react'
/** Small mono uppercase label, as used on the landing page ("THE CLASSROOM, REWIRED"). */
export default function Eyebrow({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`text-[10.5px] leading-none font-medium tracking-[0.14em] text-muted uppercase font-mono ${className}`}>
      {children}
    </div>
  )
}
