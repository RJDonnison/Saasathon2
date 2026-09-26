import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";
import InvitationList from "../student/InvitationList.tsx";
import Button from "../ui/Button.tsx";
import Heading from "../ui/Heading.tsx";
import { CARD, INPUT } from "../ui/styles.ts";
import ProfileRecovery from "../auth/ProfileRecovery.tsx";
import type { Role } from "../../../shared/types";

const LINK_BUTTON =
  "self-start border-0 bg-transparent p-0 text-[13px]! text-muted underline underline-offset-2 hover:text-ink";

const POINTS = [
  {
    title: "Teach together",
    body: "Start a lesson and bring everyone to the same page, or let students work through it at their own pace.",
  },
  {
    title: "See how it’s going",
    body: "Progress, raised hands and questions sit in one view, so you know who needs you.",
  },
  {
    title: "Help without the answers",
    body: "A student who is stuck gets a nudge in the right direction, not the solution.",
  },
];

export default function JoinPage() {
  const {
    session,
    user,
    loading,
    profileResolution,
    signInWithGoogle,
    createClassroom,
    signOut,
  } = useAuth();
  const navigate = useNavigate();
  const [classroomName, setClassroomName] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading)
    return (
      <main className="grid min-h-screen place-content-center justify-items-center gap-4 bg-canvas font-mono text-xs text-ink">
        <img className="size-[46px] object-contain" src="/favicon.svg" alt="" />
        Getting your workspace ready…
      </main>
    );
  if (user) return <Navigate to={`/${user.role}`} replace />;
  if (profileResolution === "profile-error") return <ProfileRecovery />;

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
  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await createClassroom(classroomName.trim());
      navigate(`/${created.role}`, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setBusy(false);
    }
  }

  const name =
    (session?.user.user_metadata?.full_name as string | undefined) ??
    session?.user.email;

  return (
    <main className="flex min-h-screen flex-col bg-canvas text-ink" id="top">
      <header className="mx-auto flex h-20 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <a
          className="inline-flex items-center gap-2.5 font-display! text-[23px]! font-bold! tracking-[-1.3px]"
          href="/"
          aria-label="loop home"
        >
          <img className="size-[33px] object-contain" src="/favicon.svg" alt="" />
          <span>
            loop<span className="text-accent">.</span>
          </span>
        </a>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 py-10 sm:px-6 lg:grid-cols-[1.15fr_1fr] lg:gap-20 lg:py-16">
        <section className="flex flex-col gap-5">
          <h1 className="m-0! max-w-xl font-display! text-[length:clamp(36px,5vw,56px)]! leading-[1.08]! font-semibold! tracking-[-0.035em]!">
            A shared space for the whole class.
          </h1>
          <p className="m-0 max-w-md text-lg leading-relaxed text-muted">
            Teachers plan and run lessons. Students follow along, ask questions
            and see their progress, all in one place.
          </p>
        </section>

        <section
          className={`flex flex-col gap-5 p-6 sm:p-8 ${CARD}`}
          id="get-started"
          aria-label="Sign in"
        >
          {!session ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Heading as="h2" variant="name">
                  Sign in
                </Heading>
                <p className="m-0 text-sm text-muted">
                  Use your Google account to create a classroom or accept an
                  invitation from your teacher.
                </p>
              </div>
              {error && (
                <p
                  className="m-0 rounded-xl bg-peach px-4 py-3 text-sm text-peach-ink"
                  role="alert"
                >
                  {error}
                </p>
              )}
              <Button size="lg" onClick={onGoogle} disabled={busy}>
                <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden="true">
                  <path
                    fill="#FFC107"
                    d="M43.6 24.5c0-1.4-.1-2.8-.4-4.1H24v7.8h11a9.4 9.4 0 0 1-4.1 6.2v5.1h6.7c3.9-3.6 6-8.8 6-15Z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 44c5.5 0 10.1-1.8 13.5-4.8l-6.7-5.1c-1.8 1.2-4.1 2-6.8 2-5.2 0-9.6-3.5-11.2-8.2H5.9v5.3A20 20 0 0 0 24 44Z"
                  />
                  <path
                    fill="#4A90E2"
                    d="M12.8 27.9a12 12 0 0 1 0-7.8v-5.3H5.9a20 20 0 0 0 0 18.4l6.9-5.3Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M24 11.9c3 0 5.6 1 7.7 3l5.8-5.8C34 5.7 29.5 4 24 4A20 20 0 0 0 5.9 14.8l6.9 5.3c1.6-4.7 6-8.2 11.2-8.2Z"
                  />
                </svg>
                {busy ? "Opening Google…" : "Continue with Google"}
              </Button>
              <p className="m-0 text-xs text-subtle">
                Students join by accepting an invitation from their teacher.
              </p>
            </>
          ) : (
            <>
              <p className="m-0 text-sm text-muted">
                Signed in as <strong className="text-ink">{name}</strong>
              </p>
              {role === "student" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Heading as="h2" variant="name">
                      Waiting for an invitation
                    </Heading>
                    <p className="m-0 text-sm text-muted">
                      Ask your teacher to invite this email address. Invitations
                      show up here, and you choose whether to join.
                    </p>
                  </div>
                  <InvitationList />
                  <div className="flex flex-col items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("teacher")}
                      className={LINK_BUTTON}
                    >
                      Are you a teacher? Set up a classroom
                    </button>
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className={LINK_BUTTON}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <Heading as="h2" variant="name">
                      Create your classroom
                    </Heading>
                    <p className="m-0 text-sm text-muted">
                      Name it, then invite your students by email. They choose
                      whether to join.
                    </p>
                  </div>
                  <form onSubmit={onCreate} className="flex flex-col gap-4">
                    <label className="flex flex-col gap-1.5 text-sm font-medium">
                      Classroom name
                      <input
                        className={`h-11 w-full ${INPUT}`}
                        value={classroomName}
                        onChange={(e) => setClassroomName(e.target.value)}
                        placeholder="For example, Year 11 Digital Technologies"
                        maxLength={80}
                        required
                      />
                    </label>
                    {error && (
                      <p
                        className="m-0 rounded-xl bg-peach px-4 py-3 text-sm text-peach-ink"
                        role="alert"
                      >
                        {error}
                      </p>
                    )}
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      disabled={busy}
                    >
                      {busy ? "Creating…" : "Create classroom"}
                    </Button>
                  </form>
                  <div className="flex flex-col items-start gap-3">
                    <button
                      type="button"
                      onClick={() => setRole("student")}
                      className={LINK_BUTTON}
                    >
                      I’m a student
                    </button>
                    <button
                      type="button"
                      onClick={() => void signOut()}
                      className={LINK_BUTTON}
                    >
                      Sign out
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <section
        className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6"
        aria-label="What it does"
      >
        <div className="grid gap-8 border-t border-border pt-10 md:grid-cols-3 md:gap-10">
          {POINTS.map((point) => (
            <div key={point.title} className="flex flex-col gap-2">
              <Heading as="h2" variant="h2">
                {point.title}
              </Heading>
              <p className="m-0 text-sm leading-relaxed text-muted">
                {point.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <div className="flex h-16 items-center justify-between border-t border-border text-xs text-subtle">
          <span>© 2026 Loop</span>
          <a className="hover:text-ink" href="#top">
            Back to top
          </a>
        </div>
      </footer>
    </main>
  );
}
