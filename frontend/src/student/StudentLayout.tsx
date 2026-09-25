import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext.tsx'

export default function StudentLayout() {
  const { user, logout } = useAuth()
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <h1 className="font-semibold">Student — {user?.name}</h1>
        <button onClick={logout} className="text-sm text-blue-600 underline">
          Leave classroom
        </button>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
