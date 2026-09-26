import { useEffect, useRef, useState } from "react";
import { onPresenceUpdate } from "../socket.ts";
import type { PresenceUpdatePayload } from "../../../shared/events";

/** Keeps the online-student snapshot for one classroom in sync with socket presence updates. */
export function useClassroomPresence(
  classroomId: string | undefined,
  onUpdate?: (payload: PresenceUpdatePayload) => void,
) {
  const [online, setOnline] = useState<Set<string>>(new Set());
  const [hasSnapshot, setHasSnapshot] = useState(false);
  const onUpdateRef = useRef(onUpdate);

  useEffect(() => {
    onUpdateRef.current = onUpdate;
  }, [onUpdate]);

  useEffect(() => {
    setOnline(new Set());
    setHasSnapshot(false);
    if (!classroomId) return;

    const unsubscribe = onPresenceUpdate((payload) => {
      if (payload.classroomId !== classroomId) return;
      setOnline(new Set(payload.onlineStudentIds));
      setHasSnapshot(true);
      onUpdateRef.current?.(payload);
    });
    return unsubscribe;
  }, [classroomId]);

  return { online, hasSnapshot };
}
