import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import { onPresenceUpdate, onStudentStatusUpdate } from "../socket.ts";
import type { StudentStatus } from "../../../shared/events";
import type { User } from "../../../shared/types";

export default function ClassroomGrid({
  onSelect,
}: {
  onSelect: (student: User) => void;
}) {
  const { user } = useAuth();
  const [students, setStudents] = useState<User[]>([]);
  const [online, setOnline] = useState(new Set<string>());
  const [status, setStatus] = useState<Record<string, StudentStatus>>({});
  const classroomId = user?.classroomId;

  useEffect(() => {
    setStudents([]);
    setOnline(new Set());
    setStatus({});
    if (!classroomId) return;

    let cancelled = false;
    void api
      .getStudents(classroomId)
      .then((nextStudents) => {
        if (!cancelled) setStudents(nextStudents);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [classroomId]);

  useEffect(() => {
    if (!classroomId) return;
    return onPresenceUpdate((payload) => {
      if (payload.classroomId === classroomId)
        setOnline(new Set(payload.onlineStudentIds));
    });
  }, [classroomId]);

  useEffect(() => {
    if (!classroomId) return;
    return onStudentStatusUpdate((payload) => {
      if (payload.classroomId === classroomId)
        setStatus((current) => ({
          ...current,
          [payload.studentId]: payload.status,
        }));
    });
  }, [classroomId]);
  return (
    <section className="rounded border bg-white p-4">
      <h2 className="mb-3 font-semibold">Classroom roster</h2>
      <p className="mb-3 text-xs text-gray-500">
        Select a student to load their activity; the roster itself is fetched
        once.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {students.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="flex items-center justify-between rounded border p-3 text-left text-sm"
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${online.has(s.id) ? "bg-green-500" : "bg-gray-300"}`}
              />
              {s.name}
            </span>
            <span className="text-xs text-gray-500">
              {status[s.id] ?? "idle"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
