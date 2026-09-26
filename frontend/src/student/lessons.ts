import type { LessonSummary, ProgressStatus } from "../../../shared/types";

export const STATUS_LABEL: Record<ProgressStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Done",
};

/** Where to pick up: the lesson already under way, else the first one not finished, else nothing (all done). */
export function pickCurrent(lessons: LessonSummary[]): LessonSummary | null {
  const open = lessons.filter((l) => l.available);
  return (
    open.find((l) => l.status === "in_progress") ??
    open.find((l) => l.status !== "completed") ??
    null
  );
}

function windowTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** The teacher's time window for a lesson in words ("Opens Mon 9:00 am"), or null when it has no limit to mention. */
export function lessonWindowLabel(
  lesson: Pick<LessonSummary, "opensAt" | "closesAt" | "available">,
): string | null {
  if (!lesson.available) {
    if (lesson.opensAt && Date.parse(lesson.opensAt) > Date.now())
      return `Opens ${windowTime(lesson.opensAt)}`;
    return lesson.closesAt ? `Closed ${windowTime(lesson.closesAt)}` : null;
  }
  return lesson.closesAt && Date.parse(lesson.closesAt) > Date.now()
    ? `Open until ${windowTime(lesson.closesAt)}`
    : null;
}

/** The next moment (ms since epoch) a lesson's window opens or closes, so the list can be refreshed exactly then. */
export function nextWindowChange(lessons: LessonSummary[]): number | null {
  const now = Date.now();
  const times = lessons
    .flatMap((l) => [l.opensAt, l.closesAt])
    .filter((t): t is string => t !== null)
    .map((t) => Date.parse(t))
    .filter((t) => t > now);
  return times.length ? Math.min(...times) : null;
}

/** Summary values shared by the student dashboard, class page, and live lesson. */
export function lessonOverview(lessons: LessonSummary[]) {
  const current = pickCurrent(lessons);
  return {
    completedCount: lessons.filter((lesson) => lesson.status === "completed")
      .length,
    todo: lessons.filter((lesson) => lesson.status !== "completed"),
    current,
    started: lessons.some((lesson) => lesson.status !== "not_started"),
    upNext: current
      ? lessons
          .slice(lessons.indexOf(current) + 1)
          .find((lesson) => lesson.status !== "completed" && lesson.available)
      : undefined,
  };
}

/** A one-line, plain-text preview of a lesson's Markdown intro. */
export function introSnippet(content: string, max = 140): string {
  const plain = content
    .replace(/^#{1,6}[ \t]+.*$/gm, "")
    .replace(/[`*_>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > max ? `${plain.slice(0, max - 1).trimEnd()}…` : plain;
}

export function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}
