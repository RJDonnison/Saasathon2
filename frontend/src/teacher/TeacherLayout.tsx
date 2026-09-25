import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";

export default function TeacherLayout() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-[#f7f8f4] text-[#20271f]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#dfe5d8] bg-white px-6 py-4">
        <div className="flex items-center gap-5">
          <h1 className="font-semibold">Teacher — {user?.name}</h1>
          <nav className="flex gap-3 text-sm text-[#40513b]">
            <NavLink
              className="rounded-lg px-2 py-1 hover:bg-[#f4f7f0]"
              to="/teacher"
            >
              Dashboard
            </NavLink>
            <NavLink
              className="rounded-lg px-2 py-1 hover:bg-[#f4f7f0]"
              to="/teacher/modules"
            >
              Modules
            </NavLink>
          </nav>
        </div>
        <button
          onClick={() => void signOut()}
          className="text-sm font-medium text-[#5f8b3b] underline underline-offset-4"
        >
          Sign out
        </button>
      </header>
      <main className="mx-auto max-w-7xl p-6">
        <Outlet />
      </main>
    </div>
  );
}
