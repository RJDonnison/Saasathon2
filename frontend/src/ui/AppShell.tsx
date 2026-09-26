import { Link, NavLink, Outlet, useMatch } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'
import type { Role } from '../../../shared/types'
import InvitationBell from '../student/InvitationBell.tsx'
import Avatar from './Avatar.tsx'
import Button from './Button.tsx'
import { LogOutIcon } from './icons.tsx'
import { FOCUS_RING } from './styles.ts'

const NAV: Record<Role, { to: string; label: string }[]> = {
  student: [{ to: '/student', label: 'Home' }],
  teacher: [{ to: '/teacher', label: 'Classes' }],
}

/**
 * The white app header (wordmark, nav with a green underline on the current page, invitations bell for students,
 * profile) and page container shared by the student and teacher screens. A student's class screens bring their own
 * top bar and run edge to edge, so the shell steps aside for them.
 */
export default function AppShell({ role }: { role: Role }) {
  const { user, signOut } = useAuth()
  const inClass = useMatch('/student/class/*') !== null
  if (inClass) {
    return (
      <div className="min-h-dvh bg-canvas text-ink">
        <Outlet />
      </div>
    )
  }
  return (
    <div className="min-h-screen bg-canvas text-ink ">
      <header className="sticky top-0 z-20 border-b border-border bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-stretch gap-6 px-4 sm:gap-8 sm:px-6">
          {/* Same wordmark as the landing page, built from utilities with the app.css tokens. */}
          <Link to={`/${role}`} className="inline-flex items-center gap-2.5 font-display! text-[23px]! font-bold! tracking-[-1.3px]" aria-label="loop home">
            <img className="size-[33px] object-contain" src="/favicon.svg" alt="" />
            <span>
              loop<span className="text-accent">.</span>
            </span>
          </Link>
          <nav aria-label="Main" className="flex items-stretch gap-6">
            {NAV[role].map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end
                className={`inline-flex items-center border-b-2 border-transparent text-[15px]! font-semibold! text-muted hover:text-ink aria-[current=page]:border-accent aria-[current=page]:text-ink ${FOCUS_RING}`}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            {role === 'student' && <InvitationBell />}
            {user && (
              <div className="flex items-center gap-2.5">
                <Avatar name={user.name} id={user.id} size="md" />
                <div className="hidden min-w-0 flex-col gap-0.5 sm:flex">
                  <span className="max-w-40 truncate text-sm leading-tight font-semibold">{user.name}</span>
                  <span className="text-xs leading-tight text-muted capitalize">{role}</span>
                </div>
              </div>
            )}
            <Button size="icon" onClick={() => void signOut()} aria-label="Sign out">
              <LogOutIcon className="size-4" />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-7 sm:px-6 lg:py-9">
        <Outlet />
      </main>
    </div>
  )
}
