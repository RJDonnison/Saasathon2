import { Link, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { api } from "../api.ts";
import { useAuth } from "../auth/useAuth.ts";
import Button from "./Button.tsx";
import { CARD, TINT } from "./styles.ts";
import { useDialog } from "./DialogContext.tsx";
import type { MyClassroom, Role } from "../../../shared/types";

export default function ClassroomList({ role }: { role: Role }) {
  const { user, switchClassroom } = useAuth();
  const { toast } = useDialog();
  const navigate = useNavigate();
  const [classes, setClasses] = useState<MyClassroom[]>([]);
  const [switching, setSwitching] = useState<string | null>(null);
  useEffect(() => {
    void api
      .myClassrooms()
      .then((items) => setClasses(items.filter((item) => item.role === role)))
      .catch(() => {});
  }, [role, user?.classroomId]);
  const switchTo = async (item: MyClassroom) => {
    setSwitching(item.id);
    try {
      await switchClassroom(item.id);
      navigate(role === "teacher" ? "/teacher" : "/student");
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Could not switch classrooms.",
        "error",
      );
    } finally {
      setSwitching(null);
    }
  };
  return (
    <section>
      <h2 className="mb-3! font-display! text-xl! font-semibold!">
        My classrooms
      </h2>
      <div className={`${CARD} overflow-hidden`}>
        {classes.length === 0 ? (
          <p className="m-0 px-5 py-4 text-sm text-muted">
            You have no other classrooms.
          </p>
        ) : (
          classes.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3.5 first:border-0"
            >
              <div className="min-w-0">
                <strong className="block truncate text-[14px]">
                  {item.name}
                  {item.active && (
                    <small
                      className={`ml-2 rounded-full px-2 py-1 text-[10px] font-semibold ${TINT.mint}`}
                    >
                      Current
                    </small>
                  )}
                </strong>
                <span className="text-xs text-muted">
                  {role === "student"
                    ? `${item.teacherName ?? "No teacher yet"} · ${item.completedCount} of ${item.lessonCount} lessons complete`
                    : `${item.lessonCount} lesson${item.lessonCount === 1 ? "" : "s"}`}
                </span>
              </div>
              {item.active ? (
                <Link
                  to={
                    role === "teacher"
                      ? "/teacher"
                      : `/student/class/${item.id}`
                  }
                >
                  <Button size="sm">Open</Button>
                </Link>
              ) : (
                <Button
                  size="sm"
                  disabled={switching !== null}
                  onClick={() => void switchTo(item)}
                >
                  {switching === item.id ? "Switching…" : "Switch"}
                </Button>
              )}
            </div>
          ))
        )}
      </div>
    </section>
  );
}
