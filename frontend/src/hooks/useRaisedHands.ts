import { useEffect, useState } from "react";
import { onRaisedHandsUpdate } from "../socket.ts";
import type { RaisedHand } from "../../../shared/events";

/** Keeps the raised-hand snapshot for one classroom in sync with socket updates. */
export function useRaisedHands(classroomId: string | undefined) {
  const [hands, setHands] = useState<RaisedHand[]>([]);

  useEffect(() => {
    setHands([]);
    if (!classroomId) return;

    const unsubscribe = onRaisedHandsUpdate((payload) => {
      if (payload.classroomId === classroomId) setHands(payload.hands);
    });
    return unsubscribe;
  }, [classroomId]);

  return hands;
}
