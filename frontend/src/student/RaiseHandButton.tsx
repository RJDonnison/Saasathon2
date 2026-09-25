import { useState } from 'react'
import { useAuth } from '../auth/AuthContext.tsx'
import { emitRaiseHand } from '../socket.ts'

// REAL: emits raise_hand over the socket; the server broadcasts it to the classroom room.
export default function RaiseHandButton() {
  const { user } = useAuth()
  const [raised, setRaised] = useState(false)

  function raise() {
    if (!user) return
    emitRaiseHand(user.id, user.classroomId)
    setRaised(true)
    setTimeout(() => setRaised(false), 3000)
  }

  return (
    <section className="rounded border bg-white p-4">
      <button onClick={raise} className="rounded bg-amber-500 px-4 py-2 font-medium text-white">
        {raised ? 'Hand raised ✋' : 'Raise hand'}
      </button>
    </section>
  )
}
