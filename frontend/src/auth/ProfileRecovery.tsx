import { useAuth } from "./useAuth.ts";
import Button from "../ui/Button.tsx";
import { CARD, TINT } from "../ui/styles.ts";

export default function ProfileRecovery() {
  const { profileError, retryProfile, signOut } = useAuth();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <section
        className={`flex w-full max-w-md flex-col gap-4 p-6 ${CARD}`}
        aria-labelledby="profile-recovery-title"
      >
        <div className="flex flex-col gap-2">
          <p
            className="m-0 text-sm! font-semibold! text-ink"
            id="profile-recovery-title"
          >
            We could not open your classroom profile.
          </p>
          <p
            className={`m-0 rounded-xl px-4 py-3 text-sm ${TINT.peach}`}
            role="alert"
          >
            {profileError ?? "Please try again."}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="primary" onClick={() => void retryProfile()}>
            Try again
          </Button>
          <Button onClick={() => void signOut()}>Sign out</Button>
        </div>
      </section>
    </main>
  );
}
