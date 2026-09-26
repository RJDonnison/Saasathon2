import { Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './auth/ProtectedRoute.tsx'
import JoinPage from './pages/JoinPage.tsx'
import StudentLayout from './student/StudentLayout.tsx'
import StudentHome from './student/StudentHome.tsx'
import StudentClassPage from './student/StudentClassPage.tsx'
import StudentDashboard from './student/StudentDashboard.tsx'
import StudentDemoLayout from './student/StudentDemoLayout.tsx'
import StudentDemoLivePage from './student/StudentDemoLivePage.tsx'
import TeacherLayout from './teacher/TeacherLayout.tsx'
import TeacherHome from './teacher/TeacherHome.tsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<JoinPage />} />

      <Route path="/student-demo" element={<StudentDemoLayout />}>
        <Route index element={<StudentDashboard demoPreview />} />
        <Route path="class/:classroomId" element={<StudentClassPage demoPreview />} />
        <Route path="class/:classroomId/live" element={<StudentDemoLivePage />} />
        <Route path="*" element={<Navigate to="/student-demo" replace />} />
      </Route>

      <Route
        path="/student"
        element={
          <ProtectedRoute role="student">
            <StudentLayout />
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
            <TeacherLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<TeacherHome />} />
        <Route path="*" element={<Navigate to="/teacher" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
