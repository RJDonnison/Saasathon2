import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";

export default function TeacherLayout() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white px-6 py-3">
        <div className="flex items-center gap-5">
          <h1 className="font-semibold">Teacher — {user?.name}</h1>
          <nav className="flex gap-3 text-sm">
            <NavLink to="/teacher">Dashboard</NavLink>
            <NavLink to="/teacher/modules">Modules</NavLink>
          </nav>
        </div>
        <button
          onClick={() => void signOut()}
          className="text-sm text-blue-600 underline"
        >
          Sign out
        </button>
      </header>
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}
