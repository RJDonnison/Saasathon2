import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.ts'
import { useAuth } from '../auth/useAuth.ts'
import { onModuleChanged, onModuleDeleted } from '../socket.ts'
import type { Announcement, Classroom, LessonSummary, ProgressStatus } from '../../../shared/types'

/** The active classroom, the student's lessons (with their progress) and the teacher's notes. `null` = still loading. */
export function useClassData() {
  const { user } = useAuth()
  const [classroom, setClassroom] = useState<Classroom | null>(null)
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null)
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const classroomId = user?.classroomId

  useEffect(() => {
    if (!classroomId) return
    let active = true
    api.getClassroom(classroomId).then((c) => active && setClassroom(c)).catch(() => {})
    api.getAnnouncements(classroomId).then((a) => active && setAnnouncements(a)).catch(() => active && setAnnouncements([]))
    api
      .getLessons(classroomId)
      .then((l) => active && setLessons(l))
      .catch((err) => {
        console.error(err)
        if (active) {
          setLessons([])
          setError(err instanceof Error ? err.message : 'Could not load your lessons')
        }
      })
    return () => {
      active = false
    }
  }, [classroomId])

  // The teacher edited, published or deleted a lesson: reload the list (statuses come with it).
  useEffect(() => {
    if (!classroomId) return
    const refresh = () => {
      api.getLessons(classroomId).then(setLessons).catch(() => {})
    }
    const changed = onModuleChanged(refresh)
    const deleted = onModuleDeleted(refresh)
    return () => {
      changed()
      deleted()
    }
  }, [classroomId])

  /** Update one lesson's status locally and on the server. */
  const setStatus = useCallback((lessonId: string, status: ProgressStatus) => {
    setLessons((all) => all?.map((l) => (l.id === lessonId ? { ...l, status } : l)) ?? all)
    void api.upsertProgress({ moduleId: lessonId, status }).catch((err) => console.warn('Could not save progress:', err))
  }, [])

  return { classroom, lessons, announcements, error, setStatus }
}
