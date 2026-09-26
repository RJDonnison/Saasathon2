import AppShell from "../ui/AppShell.tsx";
import { StudentNotificationsProvider } from "./StudentNotifications.tsx";

export default function StudentLayout() {
  return (
    <StudentNotificationsProvider>
      <AppShell role="student" />
    </StudentNotificationsProvider>
  );
}
