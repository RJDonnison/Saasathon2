import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { emitRaiseHand, onRaisedHandsUpdate } from '../socket.ts'
import Button from '../ui/Button.tsx'
import { CheckIcon, HandIcon } from '../ui/icons.tsx'

export default function RaiseHandButton() {
  const { user } = useAuth()
  const [raised, setRaised] = useState(false)

  useEffect(
    () =>
      onRaisedHandsUpdate((update) => {
        if (user && update.classroomId === user.classroomId)
          setRaised(update.hands.some((hand) => hand.studentId === user.id))
      }),
    [user],
  )

  function raise() {
    if (!user || raised) return
    // Keep the acknowledgement visual while the server records the hand; it clears only
    // when a teacher's Help action removes this student from the shared snapshot.
    if (emitRaiseHand(user.id, user.classroomId)) setRaised(true)
  }

  return (
    <Button size="lg" variant={raised ? 'peach' : 'default'} onClick={raise} aria-live="polite" className="relative">
      {raised ? <CheckIcon className="size-4" /> : <HandIcon className="size-4" />}
      {raised ? 'Hand raised — waiting for help' : 'Raise hand'}
      {raised && (
        <span aria-hidden="true" className="absolute -top-1 -right-1 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-coral opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-3 rounded-full bg-coral" />
        </span>
      )}
    </Button>
  )
}
