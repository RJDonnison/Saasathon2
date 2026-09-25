import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'

export default function TeacherLayout() {
  const { user, signOut } = useAuth()
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <h1 className="font-semibold">Teacher — {user?.name}</h1>
        <button onClick={() => void signOut()} className="text-sm text-blue-600 underline">
          Sign out
        </button>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
