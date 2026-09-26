import { createContext, useContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { JoinRequest, User } from '../../../shared/types'

export interface AuthState {
  /** The Supabase (Google) session; null when signed out. */
  session: Session | null
  /** The classroom profile; null when signed out OR signed in but not yet joined to a classroom. */
  user: User | null
  /** true until the session and (if signed in) the classroom profile have been resolved */
  loading: boolean
  /** true while a new classroom membership is being saved after sign-in */
  joiningClassroom: boolean
  signInWithGoogle: () => Promise<void>
  joinClassroom: (req: JoinRequest) => Promise<User>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
