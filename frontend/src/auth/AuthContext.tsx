import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { api, ApiClientError } from '../api.ts'
import { supabase } from '../supabase.ts'
import { connectSocket, disconnectSocket } from '../socket.ts'
import { AuthContext, type AuthState } from './useAuth.ts'
import type { JoinRequest, User } from '../../../shared/types'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  // The classroom profile, tagged with the Supabase user it belongs to (null user = not joined yet).
  const [profile, setProfile] = useState<{ authId: string; user: User | null } | null>(null)

  // Track the Supabase session. getSession() also finishes the OAuth redirect (tokens in the URL).
  // Keep the callback synchronous: calling other supabase methods inside it can deadlock.
  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setSessionReady(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      setSessionReady(true)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  // Load the classroom profile whenever the signed-in identity changes (not on token refreshes).
  const authId = session?.user.id ?? null
  useEffect(() => {
    if (!sessionReady || !authId) return
    let cancelled = false
    api
      .me()
      .then(({ user }) => {
        if (!cancelled) setProfile({ authId, user })
      })
      .catch((err) => {
        console.warn('[auth] could not load profile:', err)
        // The backend rejected the session outright (e.g. the account was removed): drop it locally.
        if (err instanceof ApiClientError && err.status === 401) void supabase.auth.signOut({ scope: 'local' })
        if (!cancelled) setProfile({ authId, user: null })
      })
    return () => {
      cancelled = true
    }
  }, [sessionReady, authId])

  // Derived: a profile only counts if it belongs to the currently signed-in Supabase user.
  const resolved = authId !== null && profile?.authId === authId
  const user = resolved ? profile.user : null
  const loading = !sessionReady || (authId !== null && !resolved)

  // The socket lives exactly as long as there is a signed-in user in a classroom.
  useEffect(() => {
    if (user) connectSocket()
    else disconnectSocket()
  }, [user])

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }, [])

  const joinClassroom = useCallback(
    async (req: JoinRequest) => {
      const { user } = await api.join(req)
      if (authId) setProfile({ authId, user })
      return user
    },
    [authId],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthState>(
    () => ({ session, user, loading, signInWithGoogle, joinClassroom, signOut }),
    [session, user, loading, signInWithGoogle, joinClassroom, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
