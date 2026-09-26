import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { useAuth } from "./auth/useAuth.ts";
import { onSessionUpdate } from "./socket.ts";
import type { LessonSession } from "../../shared/types";

/**
 * The classroom's live lesson. `undefined` until first loaded, `null` when nothing is live. Pushed changes arrive
 * over the socket; a slow poll covers a missed event (e.g. a socket that was reconnecting).
 */
export function useLiveSession() {
  const { user } = useAuth();
  const classroomId = user?.classroomId;
  const [state, setState] = useState<{
    classroomId: string;
    session: LessonSession | null;
  } | null>(null);

  useEffect(() => {
    if (!classroomId) return;
    const activeClassroomId = classroomId;
    let isCurrent = true;

    async function load() {
      try {
        const { session } = await api.getSession(activeClassroomId);
        if (isCurrent) setState({ classroomId: activeClassroomId, session });
      } catch {
        // Keep the last known session until the next poll or socket update.
      }
    }

    void load();
    const interval = window.setInterval(() => void load(), 30_000);
    const unsubscribe = onSessionUpdate((payload) => {
      if (isCurrent && payload.classroomId === classroomId)
        setState({ classroomId, session: payload.session });
    });
    return () => {
      isCurrent = false;
      window.clearInterval(interval);
      unsubscribe();
    };
  }, [classroomId]);

  const session =
    state && state.classroomId === classroomId ? state.session : undefined;
  return {
    session,
    setSession: (next: LessonSession | null) =>
      classroomId && setState({ classroomId, session: next }),
  };
}
