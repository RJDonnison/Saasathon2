import {
  Component,
  lazy,
  Suspense,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute.tsx";
import JoinPage from "./pages/JoinPage.tsx";

const StudentLayout = lazy(() => import("./student/StudentLayout.tsx"));
const StudentHome = lazy(() => import("./student/StudentHome.tsx"));
const StudentClassPage = lazy(() => import("./student/StudentClassPage.tsx"));
const StudentDashboard = lazy(() => import("./student/StudentDashboard.tsx"));
const TeacherLayout = lazy(() => import("./teacher/TeacherLayout.tsx"));
const TeacherDashboard = lazy(() => import("./teacher/TeacherDashboard.tsx"));
const TeacherClass = lazy(() => import("./teacher/TeacherClass.tsx"));
const ModuleBuilder = lazy(() => import("./teacher/ModuleBuilder.tsx"));
const StudentWorkView = lazy(() => import("./teacher/StudentWorkView.tsx"));
const TeacherLessonFeedback = lazy(
  () => import("./teacher/TeacherLessonFeedback.tsx"),
);

function RouteLoading() {
  return (
    <main
      className="flex min-h-dvh items-center justify-center bg-canvas p-6"
      aria-busy="true"
    >
      <p className="text-sm text-muted" role="status">
        Loading your workspace…
      </p>
    </main>
  );
}

function isChunkLoadError(error: unknown) {
  return (
    error instanceof Error &&
    /(?:loading chunk|failed to fetch dynamically imported module|importing a module script failed)/i.test(
      error.message,
    )
  );
}

class LazyRouteErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return isChunkLoadError(error) ? { error } : null;
  }
  componentDidCatch(error: Error, _info: ErrorInfo) {
    if (!isChunkLoadError(error)) throw error;
  }
  render() {
    if (this.state.error)
      return (
        <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <p className="m-0 text-sm text-peach-ink" role="alert">
              This screen could not load.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg bg-accent px-3 py-2 text-sm! font-semibold! text-ink"
            >
              Try again
            </button>
          </div>
        </main>
      );
    return this.props.children;
  }
}

function AuthenticatedScreen({ children }: { children: ReactNode }) {
  return (
    <LazyRouteErrorBoundary>
      <Suspense fallback={<RouteLoading />}>{children}</Suspense>
    </LazyRouteErrorBoundary>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<JoinPage />} />

      <Route
        path="/student"
        element={
          <ProtectedRoute role="student">
            <AuthenticatedScreen>
              <StudentLayout />
            </AuthenticatedScreen>
          </ProtectedRoute>
        }
      >
        <Route index element={<StudentDashboard />} />
        <Route path="class/:classroomId" element={<StudentClassPage />} />
        <Route path="class/:classroomId/live" element={<StudentHome />} />
        <Route path="*" element={<Navigate to="/student" replace />} />
      </Route>

      <Route
        path="/teacher"
        element={
          <ProtectedRoute role="teacher">
            <AuthenticatedScreen>
              <TeacherLayout />
            </AuthenticatedScreen>
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherDashboard />} />
        <Route path="class/:classroomId" element={<TeacherClass />}>
          <Route index element={<Navigate to="live" replace />} />
          <Route path="live" element={null} />
          <Route path="manage" element={null} />
        </Route>
        <Route path="modules/new" element={<ModuleBuilder />} />
        <Route path="modules/:id" element={<ModuleBuilder />} />
        <Route
          path="student-work/:studentId/:moduleId"
          element={<StudentWorkView />}
        />
        <Route path="feedback/:sessionId" element={<TeacherLessonFeedback />} />
        <Route
          path="feedback/:sessionId/students/:studentId"
          element={<TeacherLessonFeedback />}
        />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
