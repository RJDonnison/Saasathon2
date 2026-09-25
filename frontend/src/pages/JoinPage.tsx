import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";
import type { Role } from "../../../shared/types";

const field =
  "w-full rounded-xl border border-[#dfe5d8] bg-white px-3 py-2.5 text-sm text-[#20271f] outline-none transition focus:border-[#71984f] focus:ring-2 focus:ring-[#b7ee89]/50";

export default function JoinPage() {
  const { session, user, loading, signInWithGoogle, joinClassroom, signOut } =
    useAuth();
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading)
    return (
      <main
        className="grid min-h-screen place-items-center bg-[#f7f8f4] p-6 text-sm text-[#697266]"
        role="status"
      >
        Getting your classroom ready…
      </main>
    );
  if (user) return <Navigate to={`/${user.role}`} replace />;

  async function onGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start Google sign-in",
      );
      setBusy(false);
    }
  }

  async function onJoin(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const joined = await joinClassroom({ roomCode, role });
      navigate(`/${joined.role}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const displayName =
    (session?.user.user_metadata?.full_name as string | undefined) ??
    session?.user.email;

  return (
    <main className="min-h-screen bg-[#f7f8f4] px-6 py-10 text-[#20271f] sm:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-10">
        <header className="flex items-center gap-3 text-lg font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-xl bg-[#b7ee89] font-mono text-sm">
            {"{ }"}
          </span>
          loop<span className="text-[#5f8b3b]">.</span>
        </header>
        <section className="grid items-center gap-8 lg:grid-cols-[1fr_26rem] lg:gap-16">
          <div className="flex max-w-xl flex-col gap-5">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#5f8b3b]">
              THE CLASSROOM, REWIRED
            </p>
            <h1 className="text-5xl font-semibold tracking-tight text-[#20271f] sm:text-6xl">
              Make room to <span className="text-[#71984f]">create.</span>
            </h1>
            <p className="max-w-md text-base leading-7 text-[#697266]">
              A creative coding classroom where students make, explore, and
              learn together.
            </p>
          </div>
          <section
            className="flex flex-col gap-5 rounded-2xl border border-[#dfe5d8] bg-white p-6 shadow-sm"
            aria-labelledby="join-title"
          >
            <div className="flex flex-col gap-1">
              <p className="text-xs font-semibold tracking-[0.16em] text-[#5f8b3b]">
                {session ? "02 · JOIN YOUR CLASS" : "01 · YOUR WORKSPACE"}
              </p>
              <h2
                id="join-title"
                className="text-2xl font-semibold tracking-tight"
              >
                {session ? "Find your room." : "Come on in."}
              </h2>
            </div>
            {error && (
              <p
                className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
                role="alert"
              >
                {error}
              </p>
            )}
            {!session ? (
              <button
                onClick={() => void onGoogle()}
                disabled={busy}
                className="rounded-xl border border-[#dfe5d8] bg-white px-4 py-3 text-sm font-semibold text-[#20271f] transition hover:bg-[#f4f7f0] focus:outline-none focus:ring-2 focus:ring-[#b7ee89] disabled:cursor-wait disabled:opacity-60"
              >
                {busy ? "Opening Google…" : "Continue with Google"}
              </button>
            ) : (
              <form onSubmit={onJoin} className="flex flex-col gap-4">
                <p className="text-sm text-[#697266]">
                  Signed in as{" "}
                  <strong className="font-semibold text-[#20271f]">
                    {displayName}
                  </strong>
                  .{" "}
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="font-medium text-[#5f8b3b] underline underline-offset-4"
                  >
                    Sign out
                  </button>
                </p>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#40513b]">
                  Room code
                  <input
                    className={`${field} uppercase`}
                    value={roomCode}
                    onChange={(event) => setRoomCode(event.target.value)}
                    placeholder="DEMO123"
                    required
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm font-medium text-[#40513b]">
                  I am a
                  <select
                    className={field}
                    value={role}
                    onChange={(event) => setRole(event.target.value as Role)}
                  >
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="rounded-xl bg-[#71984f] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#5f8b3b] focus:outline-none focus:ring-2 focus:ring-[#b7ee89] focus:ring-offset-2 disabled:cursor-wait disabled:opacity-60"
                >
                  {busy ? "Joining…" : "Enter the classroom"}
                </button>
              </form>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
