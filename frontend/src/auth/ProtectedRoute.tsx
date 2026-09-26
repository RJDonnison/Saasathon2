import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from './useAuth.ts'
import type { Role } from '../../../shared/types'

/**
 * Requires an authenticated user with the given role.
 * No user -> "/". Wrong role -> that user's own base route (e.g. a student hitting /teacher -> /student).
 */
export default function ProtectedRoute({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    // Mirrors the landing page's loading screen (same tokens, built from utilities).
    return (
      <main className="grid min-h-screen place-content-center justify-items-center gap-4 bg-canvas font-mono text-xs text-ink">
        <img className="size-[46px] object-contain" src="/favicon.svg" alt="" />
        Getting your workspace ready…
      </main>
    )
  }
  if (!user) return <Navigate to="/" replace />
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />
  return <>{children}</>
}
