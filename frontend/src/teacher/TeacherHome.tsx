import ClassroomGrid from './ClassroomGrid.tsx'
import StudentDetailPanel from './StudentDetailPanel.tsx'
import RaiseHandAlert from './RaiseHandAlert.tsx'

export default function TeacherHome() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RaiseHandAlert />
      <ClassroomGrid />
      <StudentDetailPanel />
    </div>
  )
}
