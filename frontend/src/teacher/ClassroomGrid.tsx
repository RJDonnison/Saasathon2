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
    <section className="rounded-2xl border border-[#dfe5d8] bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold">Classroom roster</h2>
      <p className="mb-3 text-xs text-[#697266]">
        Select a student to load their activity; the roster itself is fetched
        once.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {students.map((s) => (
          <button
            key={s.id}
            onClick={() => onSelect(s)}
            className="flex items-center justify-between rounded-xl border border-[#dfe5d8] p-3 text-left text-sm transition hover:bg-[#f4f7f0] focus:outline-none focus:ring-2 focus:ring-[#b7ee89]"
          >
            <span className="flex items-center gap-2">
              <span
                className={`h-2 w-2 rounded-full ${online.has(s.id) ? "bg-[#71984f]" : "bg-[#c7cec0]"}`}
              />
              {s.name}
            </span>
            <span className="text-xs text-[#697266]">
              {status[s.id] ?? "idle"}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
