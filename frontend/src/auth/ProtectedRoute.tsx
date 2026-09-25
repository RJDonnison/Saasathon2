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
  if (loading) return <p className="p-6 text-gray-500">Loading…</p>
  if (!user) return <Navigate to="/" replace />
  if (user.role !== role) return <Navigate to={`/${user.role}`} replace />
  return <>{children}</>
}
