import ClassroomGrid from "./ClassroomGrid.tsx";
import StudentDetailPanel from "./StudentDetailPanel.tsx";
import RaiseHandAlert from "./RaiseHandAlert.tsx";
import { useState } from "react";
import type { User } from "../../../shared/types";

export default function TeacherHome() {
  const [student, setStudent] = useState<User | null>(null);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <RaiseHandAlert />
      <ClassroomGrid onSelect={setStudent} />
      <StudentDetailPanel student={student} />
    </div>
  );
}
