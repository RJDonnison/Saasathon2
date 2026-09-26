import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth.ts";
import TeacherHome from "./TeacherHome.tsx";

/** The class workspace reads the teacher's active classroom, so a link to another class activates it first. */
export default function TeacherClass() {
  const { classroomId } = useParams();
  const location = useLocation();
  const { user, switchClassroom } = useAuth();
  const [failedClassroomId, setFailedClassroomId] = useState<string | null>(
    null,
  );
  const activeId = user?.classroomId;
  const mismatch = !!classroomId && activeId !== classroomId;

  useEffect(() => {
    if (!mismatch || !classroomId) return;
    let cancelled = false;
    // A route change can finish an older activation after this request. Its
    // profile update leaves `mismatch` true for the current URL, so this effect
    // activates the current class again before rendering the workspace.
    void switchClassroom(classroomId).catch(() => {
      if (!cancelled) setFailedClassroomId(classroomId);
    });
    return () => {
      cancelled = true;
    };
  }, [mismatch, classroomId, switchClassroom]);

  if (failedClassroomId === classroomId)
    return <Navigate to="/teacher" replace />;
  if (mismatch)
    return (
      <p className="m-0 text-sm text-muted" role="status">
        Opening class…
      </p>
    );
  if (location.pathname === `/teacher/class/${classroomId}`)
    return <Navigate to="live" replace />;
  if (location.pathname === `/teacher/class/${classroomId}/plan`)
    return <Outlet />;
  return <TeacherHome />;
}
