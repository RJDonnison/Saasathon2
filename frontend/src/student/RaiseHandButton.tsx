import { useEffect, useState } from 'react'
import { useAuth } from '../auth/useAuth.ts'
import { emitLowerHand, emitRaiseHand, onRaisedHandsUpdate } from '../socket.ts'
import Button from '../ui/Button.tsx'
import { CheckIcon, HandIcon } from '../ui/icons.tsx'

export default function RaiseHandButton() {
  const { user } = useAuth()
  const [raised, setRaised] = useState(false)
  const [cooldownUntil, setCooldownUntil] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    setRaised(false)
    setCooldownUntil(null)
    if (!user) return
    return onRaisedHandsUpdate((update) => {
      if (update.classroomId === user.classroomId)
        setRaised(update.hands.some((hand) => hand.studentId === user.id))
    })
  }, [user?.classroomId, user?.id])

  useEffect(() => {
    if (!cooldownUntil) return

    const refresh = () => {
      const next = Date.now()
      setNow(next)
      if (next >= cooldownUntil) setCooldownUntil(null)
    }
    refresh()
    const timer = window.setInterval(refresh, 250)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  const coolingDown = Boolean(cooldownUntil && cooldownUntil > now)
  const secondsRemaining = cooldownUntil
    ? Math.max(0, Math.ceil((cooldownUntil - now) / 1000))
    : 0

  function raise() {
    if (!user || raised || coolingDown) return
    emitRaiseHand(user.id, user.classroomId, (result) => {
      if (result.raised) {
        setRaised(true)
        setCooldownUntil(null)
      } else if (result.cooldownUntil) {
        setNow(Date.now())
        setCooldownUntil(result.cooldownUntil)
      }
    })
  }

  function lower() {
    if (!user || !raised) return
    emitLowerHand(user.id, user.classroomId, (result) => {
      setRaised(false)
      if (result.cooldownUntil) {
        setNow(Date.now())
        setCooldownUntil(result.cooldownUntil)
      }
    })
  }

  return (
    <Button
      size="lg"
      variant={raised ? 'peach' : 'default'}
      onClick={raised ? lower : raise}
      disabled={!user || coolingDown}
      aria-live="polite"
      className="relative"
    >
      {raised ? <CheckIcon className="size-4" /> : <HandIcon className="size-4" />}
      {coolingDown
        ? `Raise hand in ${secondsRemaining}s`
        : raised
          ? 'Lower hand'
          : 'Raise hand'}
      {raised && (
        <span aria-hidden="true" className="absolute -top-1 -right-1 flex size-3">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-coral opacity-75 motion-reduce:animate-none" />
          <span className="relative inline-flex size-3 rounded-full bg-coral" />
        </span>
      )}
    </Button>
  )
}
