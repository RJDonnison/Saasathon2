import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { api, ApiClientError } from "../api.ts";
import { supabase } from "../supabase.ts";
import { connectSocket, disconnectSocket } from "../socket.ts";
import { AuthContext, type AuthState } from "./useAuth.ts";
import type { JoinRequest, User } from "../../../shared/types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [joiningClassroom, setJoiningClassroom] = useState(false);
  // The classroom profile, tagged with the Supabase user it belongs to (null user = not joined yet).
  const [profile, setProfile] = useState<{
    authId: string;
    user: User | null;
  } | null>(null);
  const profileRevision = useRef(0);

  // Track the Supabase session. getSession() also finishes the OAuth redirect (tokens in the URL).
  // Keep the callback synchronous: calling other supabase methods inside it can deadlock.
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSessionReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  // Load the classroom profile whenever the signed-in identity changes (not on token refreshes).
  const authId = session?.user.id ?? null;
  useEffect(() => {
    if (!sessionReady || !authId) return;
    let cancelled = false;
    let assigned = false;
    profileRevision.current += 1;
    const loadProfile = () => {
      const requestRevision = profileRevision.current;
      void api
        .me()
        .then(({ user }) => {
          if (cancelled || requestRevision !== profileRevision.current) return;
          // Students start in the shared demo classroom until a teacher roster matches their email.
          // Keep checking for that assignment so the active membership can move to the real class.
          assigned = user !== null && !(user.role === "student" && user.classroomId === "classroom-demo");
          setProfile({ authId, user });
        })
        .catch((err) => {
          console.warn("[auth] could not load profile:", err);
          if (cancelled || requestRevision !== profileRevision.current) return;
          // The backend rejected the session outright (e.g. the account was removed): drop it locally.
          if (err instanceof ApiClientError && err.status === 401)
            void supabase.auth.signOut({ scope: "local" });
          if (!cancelled) setProfile({ authId, user: null });
        });
    };
    loadProfile();
    // A student may already be signed in when their teacher adds their email. Recheck quietly
    // until a roster assignment appears so they do not have to enter a code or refresh manually.
    const interval = window.setInterval(() => {
      if (!assigned) loadProfile();
    }, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sessionReady, authId]);

  // Derived: a profile only counts if it belongs to the currently signed-in Supabase user.
  const resolvedProfile =
    authId !== null && profile?.authId === authId ? profile : null;
  const user = resolvedProfile?.user ?? null;
  const loading = !sessionReady || (authId !== null && !resolvedProfile);

  // The socket lives exactly as long as there is a signed-in user in a classroom.
  useEffect(() => {
    if (user) connectSocket();
    else disconnectSocket();
  }, [user]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const joinClassroom = useCallback(
    async (req: JoinRequest) => {
      setJoiningClassroom(true);
      try {
        const { user } = await api.join(req);
        if (authId) {
          profileRevision.current += 1;
          setProfile({ authId, user });
        }
        return user;
      } finally {
        setJoiningClassroom(false);
      }
    },
    [authId],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user,
      loading,
      joiningClassroom,
      signInWithGoogle,
      joinClassroom,
      signOut,
    }),
    [session, user, loading, joiningClassroom, signInWithGoogle, joinClassroom, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
