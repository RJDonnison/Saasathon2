import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, ApiClientError, tokenStore } from '../api.ts'
import { connectSocket, disconnectSocket } from '../socket.ts'
import type { JoinRequest, User } from '../../../shared/types'

interface AuthState {
  user: User | null
  /** true while the stored token is being validated on app start */
  loading: boolean
  join: (req: JoinRequest) => Promise<User>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState<boolean>(() => tokenStore.get() !== null)

  // Hydrate from a stored token on app start.
  useEffect(() => {
    if (!tokenStore.get()) return
    let cancelled = false
    api
      .me()
      .then(({ user }) => {
        if (!cancelled) setUser(user)
      })
      .catch((err) => {
        // Only a rejected token means "logged out"; a network blip shouldn't wipe the session.
        if (err instanceof ApiClientError && err.status === 401) tokenStore.clear()
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Socket lives exactly as long as there is an authenticated user.
  useEffect(() => {
    const token = tokenStore.get()
    if (user && token) connectSocket(token)
    else disconnectSocket()
  }, [user])

  const join = useCallback(async (req: JoinRequest) => {
    const res = await api.join(req)
    tokenStore.set(res.token)
    setUser(res.user)
    return res.user
  }, [])

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, join, logout }), [user, loading, join, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}
