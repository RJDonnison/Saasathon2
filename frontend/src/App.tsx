import { Navigate, Route, Routes } from "react-router-dom";
import ProtectedRoute from "./auth/ProtectedRoute.tsx";
import JoinPage from "./pages/JoinPage.tsx";
import StudentLayout from "./student/StudentLayout.tsx";
import StudentHome from "./student/StudentHome.tsx";
import TeacherLayout from "./teacher/TeacherLayout.tsx";
import TeacherHome from "./teacher/TeacherHome.tsx";
import ModuleBuilder from "./teacher/ModuleBuilder.tsx";
import StudentWorkView from "./teacher/StudentWorkView.tsx";

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
        <Route path="modules/new" element={<ModuleBuilder />} />
        <Route path="modules/:id" element={<ModuleBuilder />} />
        <Route path="student-work/:studentId/:moduleId" element={<StudentWorkView />} />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
