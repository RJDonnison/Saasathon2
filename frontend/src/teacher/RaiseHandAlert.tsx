import { useEffect, useState } from 'react'
import { onRaiseHand } from '../socket.ts'

// REAL listener for raise_hand (also console.logs so it's observable without UI work).
// PLACEHOLDER rendering: shows the raw student id + time.
export default function RaiseHandAlert() {
  const [alerts, setAlerts] = useState<{ studentId: string; at: string }[]>([])

  useEffect(
    () =>
      onRaiseHand((p) => {
        console.log('[teacher] raise_hand', p)
        setAlerts((a) => [{ studentId: p.studentId, at: new Date().toLocaleTimeString() }, ...a])
      }),
    [],
  )

  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-2 font-semibold">Raised hands</h2>
      {alerts.length === 0 ? (
        <p className="text-sm text-gray-500">No raised hands.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {alerts.map((a, i) => (
            <li key={i}>
              ✋ {a.studentId} at {a.at}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
