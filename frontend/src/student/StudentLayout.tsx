import { Outlet } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";

export default function StudentLayout() {
  const { user, signOut } = useAuth();
  return (
    <div className="min-h-screen bg-[#f7f8f4] text-[#20271f]">
      <header className="flex items-center justify-between border-b border-[#dfe5d8] bg-white px-6 py-4">
        <h1 className="font-semibold">Student — {user?.name}</h1>
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
