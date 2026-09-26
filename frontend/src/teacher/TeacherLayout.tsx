import { Outlet } from 'react-router-dom'
import { useAuth } from '../auth/useAuth.ts'

export default function TeacherLayout() {
  const { user, signOut } = useAuth()
  return (
    <div className="app-shell">
      <header className="app-header"><a className="landing-brand" href="/teacher">loop<span>.</span></a>
        <div className="header-user"><span>Teacher · {user?.name}</span><button onClick={() => void signOut()} className="text-button">
          Sign out
        </button></div>
      </header>
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  )
}
