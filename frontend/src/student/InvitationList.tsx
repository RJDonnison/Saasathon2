import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.ts'
import { useAuth } from '../auth/useAuth.ts'
import Button from '../ui/Button.tsx'
import { CARD, TINT } from '../ui/styles.ts'
import type { MyInvitation } from '../../../shared/types'

/**
 * Pending classroom invitations for the signed-in Google email. Nothing happens until the student chooses:
 * Accept enrols them (and switches their active classroom), Decline dismisses it. Renders nothing when empty.
 */
export default function InvitationList() {
  const { acceptInvitation } = useAuth()
  const [invitations, setInvitations] = useState<MyInvitation[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(() => api.myInvitations().then(setInvitations).catch(() => {}), [])

  // Poll so an invitation sent while the student is already signed in shows up without a refresh.
  useEffect(() => {
    void load()
    const interval = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(interval)
  }, [load])

  async function respond(invitation: MyInvitation, accept: boolean) {
    setBusyId(invitation.id)
    setError(null)
    try {
      // Accepting swaps in the new classroom profile, which re-routes the app; nothing more to do here.
      if (accept) await acceptInvitation(invitation.id)
      else await api.declineInvitation(invitation.id)
      setInvitations((current) => current.filter((item) => item.id !== invitation.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not answer the invitation')
      void load()
    } finally {
      setBusyId(null)
    }
  }

  if (invitations.length === 0 && !error) return null

  return (
    <div className="flex flex-col gap-3" role="region" aria-label="Classroom invitations">
      {invitations.map((invitation) => (
        <div key={invitation.id} className={`flex flex-wrap items-center justify-between gap-3 p-4 ${CARD}`}>
          <div className="flex min-w-0 flex-col">
            <p className="m-0 text-sm text-ink">
              <strong>{invitation.invitedByName}</strong> invited you to join <strong>{invitation.classroomName}</strong>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={busyId !== null} onClick={() => void respond(invitation, false)}>Decline</Button>
            <Button size="sm" variant="primary" disabled={busyId !== null} onClick={() => void respond(invitation, true)}>
              {busyId === invitation.id ? 'Working…' : 'Accept'}
            </Button>
          </div>
        </div>
      ))}
      {error && <p role="alert" className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}>{error}</p>}
    </div>
  )
}
