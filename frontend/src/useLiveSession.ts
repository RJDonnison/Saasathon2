import { useEffect, useState } from 'react'
import { api } from './api.ts'
import { useAuth } from './auth/useAuth.ts'
import { onSessionUpdate } from './socket.ts'
import type { LessonSession } from '../../shared/types'

/**
 * The classroom's live lesson. `undefined` until first loaded, `null` when nothing is live. Pushed changes arrive
 * over the socket; a slow poll covers a missed event (e.g. a socket that was reconnecting).
 */
export function useLiveSession() {
  const { user } = useAuth()
  const classroomId = user?.classroomId
  const [state, setState] = useState<{ classroomId: string; session: LessonSession | null } | null>(null)

  useEffect(() => {
    if (!classroomId) return
    let active = true
    const load = () =>
      api
        .getSession(classroomId)
        .then(({ session }) => active && setState({ classroomId, session }))
        .catch(() => {})
    void load()
    const interval = window.setInterval(() => void load(), 30000)
    const off = onSessionUpdate((p) => {
      if (active && p.classroomId === classroomId) setState({ classroomId, session: p.session })
    })
    return () => {
      active = false
      window.clearInterval(interval)
      off()
    }
  }, [classroomId])

  const session = state && state.classroomId === classroomId ? state.session : undefined
  return { session, setSession: (next: LessonSession | null) => classroomId && setState({ classroomId, session: next }) }
}
