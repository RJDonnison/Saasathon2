import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import type { TeacherStudentAggregate, User } from "../../../shared/types";

export default function StudentDetailPanel({
  student,
}: {
  student: User | null;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<TeacherStudentAggregate | null>(null);
  const [error, setError] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const classroomId = user?.classroomId;
  const studentId = student?.id;

  useEffect(() => {
    setData(null);
    setError("");
    setComments({});
    if (!classroomId || !studentId) return;

    let cancelled = false;
    void api
      .getStudentAggregate(classroomId, studentId)
      .then((aggregate) => {
        if (!cancelled) setData(aggregate);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [classroomId, studentId]);

  const submitComment = (submissionId: string) => {
    const text = comments[submissionId]?.trim();
    if (!text) return;

    void api
      .createComment({ submissionId, text, lineStart: 1 })
      .then((comment) => {
        setData((current) =>
          current !== null && current.studentId === studentId
            ? { ...current, comments: [...current.comments, comment] }
            : current,
        );
        setComments((current) => ({ ...current, [submissionId]: "" }));
      })
      .catch((e: Error) => setError(e.message));
  };
  if (!student)
    return (
      <section className="rounded-2xl border border-[#dfe5d8] bg-white p-5 text-sm text-[#697266] shadow-sm">
        Select a student to fetch their aggregate progress and submissions.
      </section>
    );
  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-[#dfe5d8] bg-white p-5 shadow-sm">
      <h2 className="font-semibold">{student.name}'s review</h2>
      {error && (
        <p
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}
      {!data ? (
        <p className="text-sm">Loading selected student activity…</p>
      ) : (
        <>
          <p className="text-sm">
            {data.moduleProgress.length} module updates · {data.attempts.length}{" "}
            attempts · {data.submissions.length} submissions
          </p>
          {data.submissions.map((s) => (
            <article
              key={s.id}
              className="flex flex-col gap-2 rounded-xl border border-[#dfe5d8] bg-[#f7f8f4] p-3"
            >
              <p className="text-xs text-gray-500">
                Submission {s.id} ·{" "}
                {s.passed === true ? "passed" : "not evaluated"}
              </p>
              <pre className="overflow-auto rounded-lg bg-[#20271f] p-3 text-xs text-[#f4f7f0]">
                {s.code}
              </pre>
              {data.comments
                .filter((c) => c.submissionId === s.id)
                .map((c) => (
                  <p key={c.id} className="text-sm">
                    Line {c.lineStart ?? "general"}: {c.text}
                  </p>
                ))}
              <div className="flex gap-2">
                <input
                  className="flex-1 rounded border px-2 py-1 text-sm"
                  value={comments[s.id] ?? ""}
                  onChange={(e) =>
                    setComments((current) => ({
                      ...current,
                      [s.id]: e.target.value,
                    }))
                  }
                  placeholder="Add a line comment"
                />
                <button
                  className="rounded-lg bg-[#71984f] px-2 py-1 text-sm font-medium text-white hover:bg-[#5f8b3b] focus:outline-none focus:ring-2 focus:ring-[#b7ee89]"
                  onClick={() => submitComment(s.id)}
                >
                  Comment line 1
                </button>
              </div>
            </article>
          ))}
        </>
      )}
    </section>
  );
}
