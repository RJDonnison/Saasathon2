import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import { useModuleRefresh } from "../hooks/useModuleRefresh.ts";
import { onSessionUpdate } from "../socket.ts";
import type {
  Announcement,
  Classroom,
  LessonSummary,
  ProgressStatus,
} from "../../../shared/types";

/** The active classroom, the student's lessons (with their progress) and the teacher's notes. `null` = still loading. */
export function useClassData() {
  const { user } = useAuth();
  const [classroom, setClassroom] = useState<Classroom | null>(null);
  const [lessons, setLessons] = useState<LessonSummary[] | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[] | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const classroomId = user?.classroomId;
  const lessonsRequest = useRef(0);
  const lessonsController = useRef<AbortController | null>(null);

  const refreshLessons = useCallback(() => {
    if (!classroomId) return;
    lessonsController.current?.abort();
    const request = ++lessonsRequest.current;
    const controller = new AbortController();
    lessonsController.current = controller;
    void api
      .getLessons(classroomId, { signal: controller.signal })
      .then((next) => {
        if (request === lessonsRequest.current) {
          setLessons(next);
          setError(null);
        }
      })
      .catch((err) => {
        if (
          !(err instanceof Error && err.name === "AbortError") &&
          request === lessonsRequest.current
        )
          setError(
            err instanceof Error
              ? err.message
              : "Could not refresh your lessons",
          );
      });
    return controller;
  }, [classroomId]);

  useEffect(() => {
    if (!classroomId) return;
    const controller = new AbortController();
    const signal = controller.signal;
    api
      .getClassroom(classroomId, { signal })
      .then((c) => !signal.aborted && setClassroom(c))
      .catch(
        (err) =>
          !signal.aborted &&
          setError(
            err instanceof Error
              ? err.message
              : "Could not load your classroom",
          ),
      );
    api
      .getAnnouncements(classroomId, { signal })
      .then((a) => !signal.aborted && setAnnouncements(a))
      .catch(
        (err) =>
          !signal.aborted &&
          setError(
            err instanceof Error ? err.message : "Could not load announcements",
          ),
      );
    const lessonsController = refreshLessons();
    return () => {
      controller.abort();
      lessonsController?.abort();
    };
  }, [classroomId, refreshLessons]);

  // The teacher edited, published or deleted a lesson: reload the list (statuses come with it).
  useModuleRefresh(classroomId, refreshLessons);

  // A live-only lesson opens and closes as the teacher starts, moves or ends the live lesson.
  useEffect(() => onSessionUpdate(() => refreshLessons()), [refreshLessons]);

  /** Update one lesson's status locally and on the server. */
  const setStatus = useCallback((lessonId: string, status: ProgressStatus) => {
    setLessons(
      (all) =>
        all?.map((l) => (l.id === lessonId ? { ...l, status } : l)) ?? all,
    );
    void api
      .upsertProgress({ moduleId: lessonId, status })
      .catch((err) => console.warn("Could not save progress:", err));
  }, []);

  return {
    classroom,
    lessons,
    announcements,
    error,
    refreshLessons,
    setStatus,
  };
}
