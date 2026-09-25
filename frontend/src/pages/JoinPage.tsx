import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'
import type { Role } from '../../../shared/types'

// Three states: signed out -> "Sign in with Google"; signed in but no classroom -> room code + role;
// joined -> straight to /student or /teacher.
export default function JoinPage() {
  const { session, user, loading, signInWithGoogle, joinClassroom, signOut } = useAuth()
  const navigate = useNavigate()
  const [roomCode, setRoomCode] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (loading) return <p className="p-6 text-gray-500">Loading…</p>
  if (user) return <Navigate to={`/${user.role}`} replace />

  async function onGoogle() {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle() // redirects away to Google
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start Google sign-in')
      setBusy(false)
    }
  }

  async function onJoin(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const joined = await joinClassroom({ roomCode, role })
      navigate(`/${joined.role}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setBusy(false)
    }
  }

  if (!session) {
    return (
      <main className="mx-auto mt-24 max-w-sm p-6">
        <h1 className="mb-6 text-2xl font-semibold">Classroom Coding Platform</h1>
        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}
        <button
          onClick={onGoogle}
          disabled={busy}
          className="w-full rounded border bg-white px-3 py-2 font-medium disabled:opacity-50"
        >
          Sign in with Google
        </button>
      </main>
    )
  }

  const who = (session.user.user_metadata?.full_name as string | undefined) ?? session.user.email
  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-1 text-2xl font-semibold">Join a classroom</h1>
      <p className="mb-6 text-sm text-gray-600">
        Signed in as {who}.{' '}
        <button type="button" onClick={() => void signOut()} className="text-blue-600 underline">
          Sign out
        </button>
      </p>
      <form onSubmit={onJoin} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Room code
          <input
            className="rounded border px-3 py-2 uppercase"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value)}
            placeholder="DEMO123"
            required
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          I am a
          <select className="rounded border px-3 py-2" value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <option value="student">Student</option>
            <option value="teacher">Teacher</option>
          </select>
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50">
          {busy ? 'Joining…' : 'Join'}
        </button>
      </form>
    </main>
  )
}
