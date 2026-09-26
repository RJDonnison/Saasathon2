import { useState } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { emitRaiseHand } from '../socket.ts'
import Button from '../ui/Button.tsx'
import { CheckIcon, HandIcon } from '../ui/icons.tsx'

// REAL: emits raise_hand over the socket; the server broadcasts it to the classroom room.
export default function RaiseHandButton() {
  const { user } = useAuth()
  const [raised, setRaised] = useState(false)

  function raise() {
    if (!user || raised) return
    emitRaiseHand(user.id, user.classroomId)
    setRaised(true)
    setTimeout(() => setRaised(false), 3000)
  }

  return (
    <Button size="lg" variant={raised ? 'peach' : 'default'} onClick={raise} aria-live="polite" className="relative">
      {raised ? <CheckIcon className="size-4" /> : <HandIcon className="size-4" />}
      {raised ? 'Hand raised' : 'Raise hand'}
      {raised && (
        <span aria-hidden="true" className="absolute -top-1 -right-1 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-coral opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-3 rounded-full bg-coral" />
        </span>
      )}
    </Button>
  )
}
