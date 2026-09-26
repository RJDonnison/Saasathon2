import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/useAuth.ts";
import { onQuestionCommentCreated } from "../socket.ts";

export type FeedbackNotification = {
  id: string;
  classroomId: string;
  moduleId: string;
  questionId: string;
  text: string;
};

type StudentNotifications = {
  feedback: FeedbackNotification[];
  dismissFeedback: (id: string) => void;
};

const StudentNotificationsContext = createContext<StudentNotifications | null>(
  null,
);

/** Keeps live teacher feedback until the student chooses it from the header bell. */
export function StudentNotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [feedback, setFeedback] = useState<FeedbackNotification[]>([]);
  const userId = user?.id;
  const classroomId = user?.classroomId;

  useEffect(() => setFeedback([]), [classroomId, userId]);

  useEffect(
    () =>
      onQuestionCommentCreated((update) => {
        if (
          !userId ||
          update.classroomId !== classroomId ||
          update.comment.studentId !== userId ||
          update.comment.authorId === userId
        )
          return;
        setFeedback((current) => {
          if (current.some((item) => item.id === update.comment.id))
            return current;
          return [
            {
              id: update.comment.id,
              classroomId: update.classroomId,
              moduleId: update.moduleId,
              questionId: update.comment.questionId,
              text: update.comment.text,
            },
            ...current,
          ].slice(0, 20);
        });
      }),
    [classroomId, userId],
  );

  const value = useMemo(
    () => ({
      feedback,
      dismissFeedback: (id: string) =>
        setFeedback((current) => current.filter((item) => item.id !== id)),
    }),
    [feedback],
  );

  return (
    <StudentNotificationsContext.Provider value={value}>
      {children}
    </StudentNotificationsContext.Provider>
  );
}

export function useStudentNotifications() {
  const context = useContext(StudentNotificationsContext);
  if (!context)
    throw new Error(
      "useStudentNotifications must be used inside StudentNotificationsProvider",
    );
  return context;
}
