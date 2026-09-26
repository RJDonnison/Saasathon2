import { randomUUID } from "node:crypto";
import { Router } from "express";
import type {
  LessonFeedbackReport,
  LessonFeedbackSafetyFlag,
  LessonFeedbackStudentDetail,
  LessonFeedbackStudentSummary,
  LessonSession,
  StudentActivityType,
} from "../../../shared/types.js";
import { requireRole } from "../auth.js";
import { complete, isAiConfigured } from "../openai.js";
import { supabase } from "../supabase.js";
import { toSession, unwrap, type SessionRow } from "../rows.js";

export const feedbackRouter = Router();

type FeedbackType = "ai_hint" | "follow_heartbeat" | "ai_summary" | "student_ai_summary" | "lesson_module";
type FeedbackEvent = {
  id: string;
  session_id: string;
  classroom_id: string;
  student_id: string | null;
  module_id: string | null;
  event_type: FeedbackType;
  payload: Record<string, unknown>;
  created_at: string;
};
type ActivityRow = { id: string; student_id: string; module_id: string; question_id: string | null; type: StudentActivityType; created_at: string };
type StudentRow = { id: string; name: string };
type DbProgress = { student_id: string; module_id: string; status: "not_started" | "in_progress" | "completed"; updated_at: string };
type Context = {
  session: SessionRow;
  sessionView: LessonSession & { endedAt: string; durationMinutes: number };
  classroomName: string;
  students: StudentRow[];
  events: FeedbackEvent[];
  activities: ActivityRow[];
  progress: DbProgress[];
  moduleTitle: string;
  moduleIds: string[];
  moduleTitles: Record<string, string>;
  started: number;
  ended: number;
};
type ClassAiSummary = {
  completedCount: number;
  summary: string;
  strengths: string[];
  studentNotes: Array<Record<string, unknown>>;
  attention: Array<{ studentId: string; studentName: string; reason: string }>;
};

function eventPayload(event: FeedbackEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object" ? event.payload : {};
}
function flagsFrom(value: unknown): LessonFeedbackSafetyFlag[] {
  const valid: LessonFeedbackSafetyFlag[] = ["harassment", "violence", "self_harm", "sexual"];
  return Array.isArray(value) ? value.filter((flag): flag is LessonFeedbackSafetyFlag => valid.includes(flag as LessonFeedbackSafetyFlag)) : [];
}
function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}
function minutes(ms: number): number { return Math.max(0, Math.round(ms / 60_000)); }

async function loadContext(sessionId: string, classroomId: string): Promise<Context | null> {
  const session = unwrap(await supabase.from("lesson_sessions").select("*").eq("id", sessionId).eq("classroom_id", classroomId).maybeSingle()) as SessionRow | null;
  if (!session || !session.ended_at) return null;
  const [classroomResult, moduleResult, membershipsResult, eventsResult, activitiesResult] = await Promise.all([
    supabase.from("classrooms").select("name").eq("id", classroomId).single(),
    supabase.from("modules").select("title").eq("id", session.module_id).maybeSingle(),
    supabase.from("memberships").select("user_id").eq("classroom_id", classroomId).eq("role", "student"),
    supabase.from("lesson_feedback_events").select("*").eq("session_id", sessionId).order("created_at"),
    supabase.from("student_activities").select("id,student_id,module_id,question_id,type,created_at").eq("classroom_id", classroomId).gte("created_at", session.started_at).lte("created_at", session.ended_at).order("created_at"),
  ]);
  const classroom = unwrap(classroomResult) as { name: string };
  const module = unwrap(moduleResult) as { title: string } | null;
  const memberships = unwrap(membershipsResult) as Array<{ user_id: string }>;
  const events = unwrap(eventsResult) as FeedbackEvent[];
  const activities = unwrap(activitiesResult) as ActivityRow[];
  const moduleIds = [...new Set([session.module_id, ...events.map((event) => event.module_id).filter((id): id is string => Boolean(id)), ...activities.map((activity) => activity.module_id)])];
  const studentIds = [...new Set([
    ...memberships.map((membership) => membership.user_id),
    ...events.map((event) => event.student_id).filter((id): id is string => Boolean(id)),
    ...activities.map((activity) => activity.student_id),
  ])];
  const [studentsResult, sessionModulesResult] = await Promise.all([
    studentIds.length ? supabase.from("users").select("id,name").in("id", studentIds).order("name") : Promise.resolve({ data: [], error: null }),
    moduleIds.length ? supabase.from("modules").select("id,title").eq("classroom_id", classroomId).in("id", moduleIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const students = unwrap(studentsResult) as StudentRow[];
  const sessionModules = unwrap(sessionModulesResult) as Array<{ id: string; title: string }>;
  const moduleTitles = Object.fromEntries(sessionModules.map((entry) => [entry.id, entry.title]));
  const started = Date.parse(session.started_at);
  const ended = Date.parse(session.ended_at);
  const progress = studentIds.length && moduleIds.length ? unwrap(await supabase.from("module_progress").select("student_id,module_id,status,updated_at").in("student_id", studentIds).in("module_id", moduleIds)) : [];
  return {
    session,
    sessionView: { ...toSession(session, module?.title ?? "Lesson"), endedAt: session.ended_at, durationMinutes: minutes(ended - started) },
    classroomName: classroom.name,
    students,
    events: events as FeedbackEvent[],
    activities: activities as ActivityRow[],
    progress: progress as DbProgress[],
    moduleTitle: module?.title ?? "Lesson",
    moduleIds,
    moduleTitles,
    started,
    ended,
  };
}

function followedSeconds(context: Context, studentId: string): { seconds: number; detachCount: number } {
  const beats = context.events.filter((event) => event.event_type === "follow_heartbeat" && event.student_id === studentId);
  let seconds = 0;
  let detachCount = 0;
  let prior: { at: number; following: boolean } | null = null;
  for (const event of beats) {
    const at = Date.parse(event.created_at);
    const following = eventPayload(event).following === true;
    if (prior) {
      const gap = Math.min(Math.max(0, at - prior.at), 30_000);
      if (prior.following) seconds += gap / 1000;
      if (prior.following && !following) detachCount += 1;
    }
    prior = { at, following };
  }
  if (prior && prior.following) seconds += Math.min(Math.max(0, context.ended - prior.at), 30_000) / 1000;
  return { seconds: Math.min(seconds, Math.max(0, (context.ended - context.started) / 1000)), detachCount };
}

function safetySummary(context: Context, studentId: string) {
  const logs = context.events.filter((event) => event.event_type === "ai_hint" && event.student_id === studentId).map(eventPayload);
  const safetyFlags = [...new Set(logs.flatMap((log) => flagsFrom(log.safetyFlags)))];
  const misuse = [...new Set(logs.flatMap((log) => Array.isArray(log.misuse) ? log.misuse.filter((v): v is string => typeof v === "string") : []))];
  const urgent = safetyFlags.some((flag) => flag === "violence" || flag === "self_harm" || flag === "sexual");
  const reviewUnavailable = logs.some((log) => log.reviewAvailable === false);
  return { logs, safetyFlags, misuse, urgent, reviewUnavailable };
}

function studentSummaries(context: Context): LessonFeedbackStudentSummary[] {
  const durationSeconds = Math.max(1, (context.ended - context.started) / 1000);
  return context.students.map((student) => {
    const studentActivities = context.activities.filter((a) => a.student_id === student.id);
    const hints = context.events.filter((e) => e.event_type === "ai_hint" && e.student_id === student.id);
    const allActions = studentActivities.length + hints.length;
    const progress = context.progress.filter((p) => p.student_id === student.id);
    const completedModules = context.moduleIds.map((moduleId) => progress.find((entry) => entry.module_id === moduleId)).filter((entry): entry is DbProgress => entry?.status === "completed");
    const observedProgress = context.moduleIds.length > 0 && completedModules.length === context.moduleIds.length ? "completed" : allActions > 0 ? "in_progress" : "not_started";
    const completedDuringSession = completedModules.filter((entry) => Date.parse(entry.updated_at) >= context.started && Date.parse(entry.updated_at) <= context.ended);
    const finished = observedProgress === "completed" && completedDuringSession.length ? completedDuringSession.map((entry) => entry.updated_at).sort().at(-1)! : null;
    const first = studentActivities.length ? Date.parse(studentActivities[0].created_at) : null;
    const last = studentActivities.length ? Date.parse(studentActivities[studentActivities.length - 1].created_at) : null;
    const activityEnd = finished ? Date.parse(finished) : last;
    const activityMinutes = first !== null && activityEnd !== null ? minutes(activityEnd - first) : (finished ? minutes(Date.parse(finished) - context.started) : 0);
    const follow = followedSeconds(context, student.id);
    const safety = safetySummary(context, student.id);
    return {
      studentId: student.id,
      studentName: student.name,
      progress: observedProgress,
      finishedAt: finished,
      activeMinutes: Math.min(activityMinutes, context.sessionView.durationMinutes),
      aiHintCount: hints.length,
      trackedActionCount: allActions,
      aiUsePercent: percent(hints.length, allActions),
      usedHelper: hints.length > 0,
      followedPercent: percent(follow.seconds, durationSeconds),
      detachCount: follow.detachCount,
      taskCount: new Set(studentActivities.filter((a) => a.question_id).map((a) => a.question_id)).size,
      quizCount: studentActivities.filter((a) => a.type === "checking_answer").length,
      safetyFlags: safety.safetyFlags,
      aiSummary: hints.length ? `Used the helper ${hints.length} ${hints.length === 1 ? "time" : "times"}; ${observedProgress === "completed" ? "finished the lesson" : "lesson completion was not recorded"}.` : `${observedProgress === "completed" ? "Finished the lesson" : "No lesson completion was recorded"}. No helper use was recorded.`,
      greenFlag: null,
      redFlag: safety.urgent ? "Urgent safety content detected in an AI conversation. Review the exact message." : safety.reviewUnavailable ? "The AI safety check was unavailable. Review this conversation manually." : safety.safetyFlags.includes("harassment") ? "Potential harassment content detected. Review the exact message." : safety.misuse.length ? `AI use needs review: ${safety.misuse.join(", ")}.` : null,
    };
  });
}

function averageQuizMinutes(context: Context): number | null {
  const groups = new Map<string, ActivityRow[]>();
  for (const activity of context.activities.filter((a) => a.question_id && (a.type === "answering_question" || a.type === "checking_answer"))) {
    const key = `${activity.student_id}:${activity.question_id}`;
    groups.set(key, [...(groups.get(key) ?? []), activity]);
  }
  const durations: number[] = [];
  for (const rows of groups.values()) {
    const start = rows.find((r) => r.type === "answering_question");
    const end = [...rows].reverse().find((r) => r.type === "checking_answer");
    if (start && end) durations.push(Math.min(Date.parse(end.created_at) - Date.parse(start.created_at), 60 * 60_000));
  }
  return durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length / 60_000) : null;
}

function classFallback(context: Context, students: LessonFeedbackStudentSummary[]): ClassAiSummary {
  const completedCount = students.filter((s) => s.progress === "completed").length;
  return {
    completedCount,
    summary: `${completedCount} of ${students.length} students have a recorded completion. ${students.filter((s) => s.usedHelper).length} used the AI helper, and ${students.filter((s) => s.detachCount > 0).length} stepped away from the teacher's screen at least once.`,
    strengths: students.filter((s) => s.progress === "completed").slice(0, 3).map((s) => `${s.studentName} completed the lesson.`),
    studentNotes: [],
    attention: students.filter((s) => s.progress !== "completed" || s.redFlag).filter((s) => s.progress !== "completed" ? true : !!s.redFlag).slice(0, 8).map((s) => ({ studentId: s.studentId, studentName: s.studentName, reason: s.redFlag ?? "Lesson completion was not recorded." })),
  };
}

async function makeClassAi(context: Context, students: LessonFeedbackStudentSummary[]): Promise<ClassAiSummary> {
  const fallback = classFallback(context, students);
  if (!isAiConfigured()) return fallback;
  try {
    const raw = await complete({
      system: "You summarize observed classroom coding lesson data for a teacher. Return JSON only with keys: summary (string), strengths (array of short strings), studentNotes (array of {studentId, summary, greenFlag, redFlag}), attentionSuggestions (array of {studentId, reason}). Do not infer ability, effort, intent, emotion, diagnoses, or misconduct beyond the provided events. A safety flag is an automated signal for teacher review, not proof. Distinguish missing tracking from a student doing nothing. Keep the class summary practical and brief.",
      history: [],
      message: JSON.stringify({ durationMinutes: context.sessionView.durationMinutes, students: students.map(({ studentId, progress, activeMinutes, aiHintCount, aiUsePercent, usedHelper, followedPercent, detachCount, taskCount, quizCount, safetyFlags, redFlag }) => ({ studentId, progress, activeMinutes, aiHintCount, aiUsePercent, usedHelper, followedPercent, detachCount, taskCount, quizCount, safetyFlags, redFlag })) }),
      maxTokens: 1800,
      json: true,
    });
    const parsed = JSON.parse(raw) as { summary?: unknown; strengths?: unknown; studentNotes?: unknown; attentionSuggestions?: unknown };
    return {
      completedCount: fallback.completedCount,
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 1200) : fallback.summary,
      strengths: Array.isArray(parsed.strengths) ? parsed.strengths.filter((v): v is string => typeof v === "string").slice(0, 5) : fallback.strengths,
      studentNotes: Array.isArray(parsed.studentNotes) ? parsed.studentNotes as Array<Record<string, unknown>> : [],
      attention: Array.isArray(parsed.attentionSuggestions) ? parsed.attentionSuggestions : fallback.attention,
    };
  } catch (error) {
    console.warn("[feedback] Could not generate class summary:", error instanceof Error ? error.message : error);
    return fallback;
  }
}

async function insertEvent(event: Omit<FeedbackEvent, "created_at"> & { created_at?: string }): Promise<void> {
  unwrap(await supabase.from("lesson_feedback_events").insert({ ...event, created_at: event.created_at ?? new Date().toISOString() }));
}

feedbackRouter.post("/follow", requireRole("student"), async (req, res) => {
  const { sessionId, following } = req.body ?? {};
  if (typeof sessionId !== "string" || typeof following !== "boolean") return res.status(400).json({ error: "sessionId and following are required" });
  const classroomId = req.user!.classroomId;
  const session = unwrap(await supabase.from("lesson_sessions").select("id,module_id").eq("id", sessionId).eq("classroom_id", classroomId).is("ended_at", null).maybeSingle()) as { id: string; module_id: string } | null;
  if (!session) return res.status(409).json({ error: "This lesson is no longer live" });
  const previous = unwrap(await supabase.from("lesson_feedback_events").select("payload,created_at").eq("session_id", sessionId).eq("student_id", req.user!.userId).eq("event_type", "follow_heartbeat").order("created_at", { ascending: false }).limit(1).maybeSingle()) as { payload: { following?: boolean }; created_at: string } | null;
  if (previous && previous.payload.following === following && Date.now() - Date.parse(previous.created_at) < 15_000) return res.status(204).end();
  await insertEvent({ id: randomUUID(), session_id: session.id, classroom_id: classroomId, student_id: req.user!.userId, module_id: session.module_id, event_type: "follow_heartbeat", payload: { following } });
  res.status(204).end();
});

feedbackRouter.get("/sessions/:sessionId", requireRole("teacher"), async (req, res) => {
  const context = await loadContext(String(req.params.sessionId), req.user!.classroomId);
  if (!context) return res.status(404).json({ error: "Ended lesson not found" });
  const students = studentSummaries(context);
  const aiEvent = context.events.find((e) => e.event_type === "ai_summary");
  const ai = aiEvent ? eventPayload(aiEvent) : await makeClassAi(context, students);
  if (!aiEvent) {
    try { await insertEvent({ id: randomUUID(), session_id: context.session.id, classroom_id: req.user!.classroomId, student_id: null, module_id: context.session.module_id, event_type: "ai_summary", payload: ai as Record<string, unknown> }); }
    catch (error) { console.warn("[feedback] Could not cache class summary:", error instanceof Error ? error.message : error); }
  }
  const notes = Array.isArray(ai.studentNotes) ? ai.studentNotes as Array<Record<string, unknown>> : [];
  const studentsWithAi = students.map((student) => {
    const note = notes.find((n) => n.studentId === student.studentId);
    return { ...student, aiSummary: typeof note?.summary === "string" ? note.summary : student.aiSummary, greenFlag: typeof note?.greenFlag === "string" ? note.greenFlag : null };
  });
  const followedSecondsTotal = students.reduce((sum, student) => sum + followedSeconds(context, student.studentId).seconds, 0);
  const rosterSeconds = students.length * Math.max(1, (context.ended - context.started) / 1000);
  const durationMinutes = context.sessionView.durationMinutes;
  const completed = studentsWithAi.filter((s) => s.progress === "completed");
  const completedThisSession = completed.filter((student) => student.finishedAt !== null);
  const suggested = Array.isArray(ai.attention) ? (ai.attention as Array<Record<string, unknown>>).flatMap((item) => {
    const studentId = typeof item.studentId === "string" ? item.studentId : "";
    const student = studentsWithAi.find((s) => s.studentId === studentId);
    return student && typeof item.reason === "string" ? [{ studentId, studentName: student.studentName, reason: item.reason }] : [];
  }) : [];
  const evidenceBasedFollowUps = studentsWithAi.filter((s) => s.progress !== "completed" || s.redFlag).map((s) => ({ studentId: s.studentId, studentName: s.studentName, reason: s.redFlag ?? "Lesson completion was not recorded." }));
  const attentionSuggestions = [...suggested, ...evidenceBasedFollowUps].reduce<typeof suggested>((result, item) => {
    if (!result.some((existing) => existing.studentId === item.studentId)) result.push(item);
    return result;
  }, []);
  const report: LessonFeedbackReport = {
    session: context.sessionView,
    classroomName: context.classroomName,
    studentCount: students.length,
    helperUsePercent: percent(studentsWithAi.filter((s) => s.usedHelper).length, studentsWithAi.length),
    independentCount: studentsWithAi.filter((s) => !s.usedHelper && s.taskCount > 0).length,
    followedPercent: percent(followedSecondsTotal, rosterSeconds),
    averageFinishMinutes: completedThisSession.length ? Math.round(completedThisSession.reduce((sum, s) => sum + s.activeMinutes, 0) / completedThisSession.length) : null,
    averageQuizMinutes: averageQuizMinutes(context),
    completedCount: completed.length,
    aiSummary: typeof ai.summary === "string" ? ai.summary : classFallback(context, students).summary,
    strengths: Array.isArray(ai.strengths) ? ai.strengths.filter((v): v is string => typeof v === "string") : [],
    attentionSuggestions,
    students: studentsWithAi,
  };
  res.json(report);
});

feedbackRouter.get("/sessions/:sessionId/students/:studentId", requireRole("teacher"), async (req, res) => {
  const context = await loadContext(String(req.params.sessionId), req.user!.classroomId);
  if (!context) return res.status(404).json({ error: "Ended lesson not found" });
  const base = studentSummaries(context).find((s) => s.studentId === req.params.studentId);
  if (!base) return res.status(404).json({ error: "Student not found in this class" });
  const allAiLogs = context.events.filter((e) => e.event_type === "ai_hint" && e.student_id === base.studentId).map((event) => {
    const payload = eventPayload(event);
    return { askedAt: event.created_at, question: String(payload.question ?? ""), reply: String(payload.reply ?? ""), safetyFlags: flagsFrom(payload.safetyFlags), misuse: Array.isArray(payload.misuse) && payload.misuse.length ? payload.misuse.join(", ") : null, reviewAvailable: payload.reviewAvailable !== false };
  });
  const safety = safetySummary(context, base.studentId);
  const aiEvent = context.events.find((e) => e.event_type === "student_ai_summary" && e.student_id === base.studentId);
  const cachedStudentSummary = eventPayload(aiEvent ?? ({} as FeedbackEvent));
  if (typeof cachedStudentSummary.summary === "string") base.aiSummary = cachedStudentSummary.summary;
  if (typeof cachedStudentSummary.greenFlag === "string") base.greenFlag = cachedStudentSummary.greenFlag;
  let aiSuggestion = typeof cachedStudentSummary.suggestion === "string" ? cachedStudentSummary.suggestion : "";
  if (!aiSuggestion && isAiConfigured()) {
    try {
      aiSuggestion = await complete({
        system: "You advise a teacher on one student's coding lesson using only the supplied observed facts and exact AI-helper turns. Return JSON only: {\"summary\": string, \"greenFlag\": string|null, \"suggestion\": string}. Keep it respectful and practical. Do not infer diagnoses, character, intent, or ability. Treat automated safety flags as signals for a human to review, not proof. Do not repeat harmful wording unnecessarily.",
        history: [],
        message: JSON.stringify({ progress: base.progress, activeMinutes: base.activeMinutes, aiHintCount: base.aiHintCount, aiUsePercent: base.aiUsePercent, followedPercent: base.followedPercent, detachCount: base.detachCount, taskCount: base.taskCount, quizCount: base.quizCount, flags: safety.safetyFlags, misuse: safety.misuse, conversations: allAiLogs.map(({ askedAt, question, safetyFlags, misuse }) => ({ askedAt, question, safetyFlags, misuse })) }),
        maxTokens: 800,
        json: true,
      });
      const parsed = JSON.parse(aiSuggestion) as { summary?: unknown; greenFlag?: unknown; suggestion?: unknown };
      aiSuggestion = typeof parsed.suggestion === "string" ? parsed.suggestion : "Review this student's recorded activity and offer a check-in about the lesson.";
      if (typeof parsed.summary === "string") base.aiSummary = parsed.summary;
      if (typeof parsed.greenFlag === "string") base.greenFlag = parsed.greenFlag;
      try { await insertEvent({ id: randomUUID(), session_id: context.session.id, classroom_id: context.session.classroom_id, student_id: base.studentId, module_id: context.session.module_id, event_type: "student_ai_summary", payload: { suggestion: aiSuggestion, summary: base.aiSummary, greenFlag: base.greenFlag } }); } catch {}
    } catch (error) {
      console.warn("[feedback] Could not generate student summary:", error instanceof Error ? error.message : error);
      aiSuggestion = "Review this student's recorded activity and offer a check-in about the lesson.";
    }
  }
  const activities = context.activities.filter((a) => a.student_id === base.studentId);
  const timeline = activities.map((activity) => ({ at: activity.created_at, type: activity.type, moduleTitle: context.moduleTitles[activity.module_id] ?? context.moduleTitle }));
  const detail: LessonFeedbackStudentDetail = { ...base, redFlag: base.redFlag ?? (safety.misuse.length ? `AI use needs review: ${safety.misuse.join(", ")}.` : null), aiLogs: allAiLogs, activityTimeline: timeline, aiSuggestion: aiSuggestion || "AI feedback is not configured. Review the activity timeline and check in with the student." };
  res.json(detail);
});
