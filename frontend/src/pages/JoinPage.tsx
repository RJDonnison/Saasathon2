import { useState, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'
import type { Role } from '../../../shared/types'

export default function JoinPage() {
  const { user, loading, join } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [role, setRole] = useState<Role>('student')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (loading) return <p className="p-6 text-gray-500">Loading…</p>
  if (user) return <Navigate to={`/${user.role}`} replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      const joined = await join({ name, roomCode, role })
      navigate(`/${joined.role}`, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  return (
    <main className="mx-auto mt-24 max-w-sm p-6">
      <h1 className="mb-6 text-2xl font-semibold">Join a classroom</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1 text-sm">
          Name
          <input
            className="rounded border px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
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
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-3 py-2 text-white disabled:opacity-50"
        >
          {submitting ? 'Joining…' : 'Join'}
        </button>
      </form>
    </main>
  )
}
