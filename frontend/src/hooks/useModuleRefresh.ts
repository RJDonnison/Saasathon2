import { useEffect, useRef } from "react";
import { onModuleChanged, onModuleDeleted } from "../socket.ts";

/** Refreshes a classroom's module data after a matching module socket event. */
export function useModuleRefresh(
  classroomId: string | undefined,
  refresh: () => void,
) {
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    if (!classroomId) return;

    const refreshIfCurrentClassroom = (eventClassroomId: string) => {
      if (eventClassroomId === classroomId) refreshRef.current();
    };
    const unsubscribeChanged = onModuleChanged((payload) =>
      refreshIfCurrentClassroom(payload.classroomId),
    );
    const unsubscribeDeleted = onModuleDeleted((payload) =>
      refreshIfCurrentClassroom(payload.classroomId),
    );
    return () => {
      unsubscribeChanged();
      unsubscribeDeleted();
    };
  }, [classroomId]);
}
