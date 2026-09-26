import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { User } from '../../../shared/types'

export interface AuthState {
  /** The Supabase (Google) session; null when signed out. */
  session: Session | null
  /** The classroom profile; null when signed out OR signed in but not yet joined to a classroom. */
  user: User | null
  /** true until the session and (if signed in) the classroom profile have been resolved */
  loading: boolean
  signInWithGoogle: () => Promise<void>
  /** A teacher creates a classroom (and becomes its teacher); it becomes their active classroom. */
  createClassroom: (name: string) => Promise<User>
  /** Accept a teacher's invitation: enrols the student and makes that classroom their active one. */
  acceptInvitation: (invitationId: string) => Promise<User>
  /** Make another of the student's classrooms the active one. */
  switchClassroom: (classroomId: string) => Promise<User>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
