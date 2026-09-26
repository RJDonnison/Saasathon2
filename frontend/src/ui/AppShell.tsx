import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'
import type { Role } from '../../../shared/types'
import Avatar from './Avatar.tsx'
import Button from './Button.tsx'
import { LogOutIcon } from './icons.tsx'
import { TINT } from './styles.ts'

/** Top bar + page container shared by the student and teacher screens. */
export default function AppShell({ role }: { role: Role }) {
  const { user, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-canvas text-ink">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/85 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-3 px-4 sm:px-6">
          {/* Same wordmark as the landing page, built from utilities with the app.css tokens. */}
          <Link to={`/${role}`} className="inline-flex items-center gap-2.5 font-display! text-[23px]! font-bold! tracking-[-1.3px]" aria-label="loop home">
            <span className="grid size-[33px] place-items-center rounded-[10px] bg-accent font-mono text-sm font-semibold tracking-[-2px] text-ink">{`{ }`}</span>
            <span>
              loop<span className="text-accent">.</span>
            </span>
          </Link>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1.5 text-[10px] leading-none font-medium tracking-[0.12em] uppercase font-mono ${role === 'teacher' ? TINT.lavender : TINT.mint}`}
          >
            {role}
          </span>
          <div className="flex-1" />
          {user && (
            <div className="flex items-center gap-2.5">
              <Avatar name={user.name} id={user.id} size="sm" />
              <span className="hidden max-w-40 truncate text-sm font-medium sm:block">{user.name}</span>
            </div>
          )}
          <Button size="sm" onClick={() => void signOut()} aria-label="Sign out">
            <LogOutIcon className="size-4" />
            <span className="hidden sm:inline">Sign out</span>
          </Button>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:py-9">
        <Outlet />
      </main>
    </div>
  )
}
