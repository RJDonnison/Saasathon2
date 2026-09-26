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
import {
  AuthContext,
  type AuthState,
  type ProfileResolution,
} from "./useAuth.ts";
import type { User } from "../../../shared/types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [profile, setProfile] = useState<User | null>(null);
  const [profileResolution, setProfileResolution] =
    useState<ProfileResolution>("session-loading");
  const [profileError, setProfileError] = useState<string | null>(null);
  const sessionKeyRef = useRef<string | null>(null);
  const profileRequestRef = useRef<{
    key: string;
    promise: Promise<void>;
  } | null>(null);

  // Track the Supabase session. getSession() also finishes the OAuth redirect (tokens in the URL).
  // Keep the callback synchronous: calling other supabase methods inside it can deadlock.
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      sessionKeyRef.current = data.session
        ? `${data.session.user.id}:${data.session.access_token}`
        : null;
      setSession(data.session);
      setSessionReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      sessionKeyRef.current = next
        ? `${next.user.id}:${next.access_token}`
        : null;
      setSession(next);
      setSessionReady(true);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const loadProfile = useCallback(async (currentSession: Session) => {
    const key = `${currentSession.user.id}:${currentSession.access_token}`;
    const existing = profileRequestRef.current;
    if (existing?.key === key) return existing.promise;

    let activeKey = key;
    let request!: Promise<void>;
    request = (async () => {
      if (sessionKeyRef.current !== key) return;
      setProfileResolution("profile-loading");
      setProfileError(null);
      setProfile(null);
      try {
        let response;
        try {
          response = await api.me(currentSession.access_token);
        } catch (error) {
          if (!(error instanceof ApiClientError) || error.status !== 401)
            throw error;
          if (sessionKeyRef.current !== key) return;

          const refreshed = await supabase.auth.refreshSession();
          const retrySession = refreshed.data.session;
          if (!retrySession?.access_token) {
            if (sessionKeyRef.current === key)
              void supabase.auth.signOut({ scope: "local" });
            return;
          }
          const retryKey = `${retrySession.user.id}:${retrySession.access_token}`;
          activeKey = retryKey;
          sessionKeyRef.current = retryKey;
          profileRequestRef.current = { key: retryKey, promise: request };
          setSession(retrySession);
          response = await api.me(retrySession.access_token);
          if (sessionKeyRef.current !== retryKey) return;
          setProfile(response.user);
          setProfileResolution(response.user ? "member" : "no-membership");
          return;
        }

        if (sessionKeyRef.current !== key) return;
        setProfile(response.user);
        setProfileResolution(response.user ? "member" : "no-membership");
      } catch (error) {
        if (sessionKeyRef.current !== activeKey) return;
        if (error instanceof ApiClientError && error.status === 401) {
          void supabase.auth.signOut({ scope: "local" });
          return;
        }
        console.warn("[auth] could not load profile:", error);
        setProfile(null);
        setProfileError(
          error instanceof Error
            ? error.message
            : "Could not load your classroom profile.",
        );
        setProfileResolution("profile-error");
      }
    })();
    profileRequestRef.current = { key, promise: request };
    try {
      await request;
    } finally {
      if (profileRequestRef.current?.promise === request)
        profileRequestRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!sessionReady) {
      setProfileResolution("session-loading");
      return;
    }
    if (!session) {
      setProfile(null);
      setProfileError(null);
      setProfileResolution("signed-out");
      return;
    }
    void loadProfile(session);
  }, [loadProfile, session, sessionReady]);

  const retryProfile = useCallback(async () => {
    if (session) await loadProfile(session);
  }, [loadProfile, session]);

  const user = profileResolution === "member" ? profile : null;
  const loading =
    profileResolution === "session-loading" ||
    profileResolution === "profile-loading";

  // The socket lives exactly as long as there is a signed-in user in a classroom, and it joins that classroom's
  // room at connect time, so switching classrooms means reconnecting.
  const userId = user?.id;
  const classroomId = user?.classroomId;
  useEffect(() => {
    if (!userId || !classroomId) {
      disconnectSocket();
      return;
    }
    disconnectSocket();
    connectSocket();
  }, [userId, classroomId]);

  const signInWithGoogle = useCallback(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }, []);

  const createClassroom = useCallback(async (name: string) => {
    const { user } = await api.createClassroom(name);
    if (sessionKeyRef.current) {
      setProfile(user);
      setProfileResolution("member");
    }
    return user;
  }, []);

  const acceptInvitation = useCallback(async (invitationId: string) => {
    const { user } = await api.acceptInvitation(invitationId);
    if (sessionKeyRef.current) {
      setProfile(user);
      setProfileResolution("member");
    }
    return user;
  }, []);

  const switchClassroom = useCallback(async (classroomId: string) => {
    const { user } = await api.activateClassroom(classroomId);
    if (sessionKeyRef.current) {
      setProfile(user);
      setProfileResolution("member");
    }
    return user;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      session,
      user,
      loading,
      profileResolution,
      profileError,
      retryProfile,
      signInWithGoogle,
      createClassroom,
      acceptInvitation,
      switchClassroom,
      signOut,
    }),
    [
      session,
      user,
      loading,
      profileResolution,
      profileError,
      retryProfile,
      signInWithGoogle,
      createClassroom,
      acceptInvitation,
      switchClassroom,
      signOut,
    ],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
