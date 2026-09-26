import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute.tsx";
import JoinPage from "./pages/JoinPage.tsx";
import StudentLayout from "./student/StudentLayout.tsx";
import StudentHome from "./student/StudentHome.tsx";
import ModulePage from "./student/ModulePage.tsx";
import TeacherLayout from "./teacher/TeacherLayout.tsx";
import TeacherHome from "./teacher/TeacherHome.tsx";
import ModuleAuthoring from "./teacher/ModuleAuthoring.tsx";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<JoinPage />} />

      <Route
        path="/student"
        element={
          <ProtectedRoute role="student">
            <StudentLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<StudentHome />} />
        <Route path="module/:id" element={<ModulePage />} />
        <Route path="*" element={<Navigate to="/student" replace />} />
      </Route>

      <Route
        path="/teacher"
        element={
          <ProtectedRoute role="teacher">
            <TeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherHome />} />
        <Route path="modules" element={<ModuleAuthoring />} />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
