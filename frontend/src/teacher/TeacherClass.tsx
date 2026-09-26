import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";
import TeacherHome from "./TeacherHome.tsx";

/** The class workspace reads the teacher's active classroom, so a link to another class activates it first. */
export default function TeacherClass() {
  const { classroomId } = useParams();
  const { user, switchClassroom } = useAuth();
  const [failed, setFailed] = useState(false);
  const activeId = user?.classroomId;
  const mismatch = !!classroomId && activeId !== classroomId;

  useEffect(() => {
    if (!mismatch || !classroomId) return;
    let cancelled = false;
    switchClassroom(classroomId).catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [mismatch, classroomId, switchClassroom]);

  if (failed) return <Navigate to="/teacher" replace />;
  if (mismatch)
    return (
      <p className="m-0 text-sm text-muted" role="status">
        Opening class…
      </p>
    );
  return <TeacherHome key={classroomId} />;
}
