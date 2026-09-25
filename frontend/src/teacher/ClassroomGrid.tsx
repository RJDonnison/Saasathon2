import { useEffect, useState } from 'react'
import { api } from '../api.ts'
import { useAuth } from '../auth/AuthContext.tsx'
import { onPresenceUpdate } from '../socket.ts'
import type { User } from '../../../shared/types'

// Lists the classroom's students (REST) with live online/offline dots (socket presence_update).
// PLACEHOLDER layout — no per-student status/progress yet.
export default function ClassroomGrid() {
  const { user } = useAuth()
  const [students, setStudents] = useState<User[]>([])
  const [online, setOnline] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (user) api.getStudents(user.classroomId).then(setStudents).catch(console.error)
  }, [user])

  useEffect(
    () =>
      onPresenceUpdate((p) => {
        console.log('[teacher] presence_update', p)
        setOnline(new Set(p.onlineStudentIds))
      }),
    [],
  )

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">Classroom</h2>
      <ul className="grid grid-cols-2 gap-2 text-sm">
        {students.map((s) => (
          <li key={s.id} className="flex items-center gap-2 rounded border p-2">
            <span className={`h-2 w-2 rounded-full ${online.has(s.id) ? 'bg-green-500' : 'bg-gray-300'}`} />
            {s.name}
          </li>
        ))}
      </ul>
    </section>
  )
}
