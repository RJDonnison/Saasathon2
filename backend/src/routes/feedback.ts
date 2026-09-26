import { randomUUID } from "node:crypto";
import { Router } from "express";
import type {
  LessonFeedbackReport,
  LessonFeedbackFlag,
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
  teachingSuggestions: string[];
  strengths: string[];
  studentNotes: Array<Record<string, unknown>>;
  attention: Array<{ studentId: string; studentName: string; reason: string }>;
};

function eventPayload(event: FeedbackEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === "object" ? event.payload : {};
}
function allFlagsFrom(payload: Record<string, unknown>): LessonFeedbackFlag[] {
  const valid: LessonFeedbackFlag[] = ["answer_seeking", "harassment", "violence", "self_harm", "sexual", "abusive_language", "cyber_abuse"];
  const values = [payload.flags, payload.safetyFlags, payload.misuse].flatMap((value) => Array.isArray(value) ? value : []);
  return [...new Set(values.filter((flag): flag is LessonFeedbackFlag => typeof flag === "string" && valid.includes(flag as LessonFeedbackFlag)))];
}
function percent(numerator: number, denominator: number): number {
  return denominator > 0 ? Math.round((numerator / denominator) * 100) : 0;
}
function minutes(ms: number): number { return Math.max(0, Math.round(ms / 60_000)); }

async function loadContext(sessionId: string, classroomId: string): Promise<Context | null> {
  // Wave 1: the session, with its lesson title and classroom name joined in.
  const found = unwrap(
    await supabase
      .from("lesson_sessions")
      .select("*, modules(title), classrooms(name)")
      .eq("id", sessionId)
      .eq("classroom_id", classroomId)
      .maybeSingle(),
  ) as unknown as (SessionRow & { modules: { title: string } | null; classrooms: { name: string } | null }) | null;
  if (!found || !found.ended_at) return null;
  const { modules: sessionModule, classrooms: classroom, ...session } = found;
  const endedAt = session.ended_at!;
  // Wave 2: everything keyed by the session or classroom.
  const [membershipsResult, eventsResult, activitiesResult] = await Promise.all([
    supabase.from("memberships").select("user_id").eq("classroom_id", classroomId).eq("role", "student"),
    supabase.from("lesson_feedback_events").select("*").eq("session_id", sessionId).order("created_at"),
    supabase.from("student_activities").select("id,student_id,module_id,question_id,type,created_at").eq("classroom_id", classroomId).gte("created_at", session.started_at).lte("created_at", endedAt).order("created_at"),
  ]);
  const memberships = unwrap(membershipsResult) as Array<{ user_id: string }>;
  const events = unwrap(eventsResult) as FeedbackEvent[];
  const activities = unwrap(activitiesResult) as ActivityRow[];
  const moduleIds = [...new Set([session.module_id, ...events.map((event) => event.module_id).filter((id): id is string => Boolean(id)), ...activities.map((activity) => activity.module_id)])];
  const studentIds = [...new Set([
    ...memberships.map((membership) => membership.user_id),
    ...events.map((event) => event.student_id).filter((id): id is string => Boolean(id)),
    ...activities.map((activity) => activity.student_id),
  ])];
  // Wave 3: names, lesson titles and progress only need the ids from wave 2, so they go out together.
  const [studentsResult, sessionModulesResult, progressResult] = await Promise.all([
    studentIds.length ? supabase.from("users").select("id,name").in("id", studentIds).order("name") : Promise.resolve({ data: [], error: null }),
    moduleIds.length ? supabase.from("modules").select("id,title").eq("classroom_id", classroomId).in("id", moduleIds) : Promise.resolve({ data: [], error: null }),
    studentIds.length && moduleIds.length ? supabase.from("module_progress").select("student_id,module_id,status,updated_at").in("student_id", studentIds).in("module_id", moduleIds) : Promise.resolve({ data: [], error: null }),
  ]);
  const students = unwrap(studentsResult) as StudentRow[];
  const sessionModules = unwrap(sessionModulesResult) as Array<{ id: string; title: string }>;
  const progress = unwrap(progressResult);
  const moduleTitles = Object.fromEntries(sessionModules.map((entry) => [entry.id, entry.title]));
  const started = Date.parse(session.started_at);
  const ended = Date.parse(endedAt);
  return {
    session,
    sessionView: { ...toSession(session, sessionModule?.title ?? "Lesson"), endedAt, durationMinutes: minutes(ended - started) },
    classroomName: classroom?.name ?? "Classroom",
    students,
    events: events as FeedbackEvent[],
    activities: activities as ActivityRow[],
    progress: progress as DbProgress[],
    moduleTitle: sessionModule?.title ?? "Lesson",
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
  const flags = [...new Set(logs.flatMap(allFlagsFrom))];
  const safetyFlags = flags.filter((flag): flag is LessonFeedbackSafetyFlag => flag !== "answer_seeking");
  const misuse = flags.filter((flag) => flag === "answer_seeking");
  const urgent = safetyFlags.some((flag) => flag !== "harassment");
  const reviewUnavailable = logs.some((log) => log.reviewAvailable === false);
  return { logs, flags, safetyFlags, misuse, urgent, reviewUnavailable };
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
      flags: safety.flags,
      aiSummary: hints.length ? `Used the helper ${hints.length} ${hints.length === 1 ? "time" : "times"}; ${observedProgress === "completed" ? "finished the lesson" : "lesson completion was not recorded"}.` : `${observedProgress === "completed" ? "Finished the lesson" : "No lesson completion was recorded"}. No helper use was recorded.`,
      greenFlag: null,
      redFlag: safety.urgent ? "Potentially harmful or unsafe content detected. Review the exact message." : safety.reviewUnavailable ? "The AI safety check was unavailable. Review this conversation manually." : safety.safetyFlags.includes("harassment") ? "Potential harassment content detected. Review the exact message." : safety.misuse.length ? "Possible answer-seeking. Review the conversation." : null,
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
  const helperCount = students.filter((s) => s.usedHelper).length;
  const followingAverage = students.length ? Math.round(students.reduce((sum, student) => sum + student.followedPercent, 0) / students.length) : 0;
  const activeCount = students.filter((student) => student.trackedActionCount > 0).length;
  const suggestions: string[] = [];
  if (completedCount < students.length) suggestions.push(`${students.length - completedCount} students did not have a completion recorded. Start the next lesson with a short recap and check who needs help resuming.`);
  if (helperCount > 0) suggestions.push(`${helperCount} students used the AI helper. Review a few of their questions and model how to turn a hint into the next coding step.`);
  if (followingAverage < 70) suggestions.push(`Recorded teacher-screen following averaged ${followingAverage}%. Add a brief pause after each demonstration so students can catch up before moving on.`);
  if (!suggestions.length) suggestions.push("The recorded activity shows broad lesson completion and no strong follow-up pattern. Ask students to explain one choice they made in their code to check understanding.");
  return {
    completedCount,
    summary: `${context.classroomName} worked on “${context.moduleTitle}” for ${context.sessionView.durationMinutes} minutes. ${activeCount} of ${students.length} students had recorded lesson activity, and ${completedCount} have a completion recorded. ${helperCount} used the AI helper; the class average for following the teacher's screen was ${followingAverage}%. The activity log contains ${context.activities.length} learning actions and ${context.events.filter((event) => event.event_type === "ai_hint").length} AI-helper turns. These figures describe what the app recorded, so missing activity may reflect missing tracking.`,
    teachingSuggestions: suggestions,
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
      system: "You write a useful end-of-lesson debrief for a teacher using observed classroom coding data. Return JSON only with keys: summary (2-4 sentences describing what happened across the class), teachingSuggestions (2-4 specific next teaching moves grounded in these records), strengths (array of short strings), studentNotes (array of {studentId, summary, greenFlag, redFlag}), attentionSuggestions (array of {studentId, reason}). Mention the lesson topic/modules, participation, completion, helper questions/themes, and teacher-screen following where data exists. Do not infer ability, effort, intent, emotion, diagnoses, or misconduct beyond the provided events. A safety flag is an automated signal for teacher review, not proof. Distinguish missing tracking from a student doing nothing. Do not repeat potentially harmful student wording.",
      history: [],
      message: JSON.stringify({
        classroom: context.classroomName,
        lesson: context.moduleTitle,
        durationMinutes: context.sessionView.durationMinutes,
        students: students.map(({ studentId, progress, activeMinutes, aiHintCount, aiUsePercent, usedHelper, followedPercent, detachCount, taskCount, quizCount, safetyFlags, redFlag }) => ({ studentId, progress, activeMinutes, aiHintCount, aiUsePercent, usedHelper, followedPercent, detachCount, taskCount, quizCount, safetyFlags, redFlag })),
        modules: [...new Set([context.moduleTitle, ...context.events.filter((event) => event.event_type === "lesson_module").map((event) => String(eventPayload(event).title ?? "")).filter(Boolean)])],
        learningActivityCounts: Object.fromEntries([...new Set(context.activities.map((activity) => activity.type))].map((type) => [type, context.activities.filter((activity) => activity.type === type).length])),
        helperQuestionThemes: context.events.filter((event) => event.event_type === "ai_hint").slice(-24).map((event) => {
          const payload = eventPayload(event);
          return { studentId: event.student_id, question: String(payload.question ?? "").slice(0, 240), flags: allFlagsFrom(payload) };
        }),
      }),
      maxTokens: 2400,
      json: true,
    });
    const parsed = JSON.parse(raw) as { summary?: unknown; teachingSuggestions?: unknown; strengths?: unknown; studentNotes?: unknown; attentionSuggestions?: unknown };
    return {
      completedCount: fallback.completedCount,
      summary: typeof parsed.summary === "string" ? parsed.summary.slice(0, 1200) : fallback.summary,
      teachingSuggestions: Array.isArray(parsed.teachingSuggestions) ? parsed.teachingSuggestions.filter((v): v is string => typeof v === "string").slice(0, 4) : fallback.teachingSuggestions,
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
  // Both lookups are keyed by the session id from the request, so they don't wait on each other.
  const [sessionResult, previousResult] = await Promise.all([
    supabase.from("lesson_sessions").select("id,module_id").eq("id", sessionId).eq("classroom_id", classroomId).is("ended_at", null).maybeSingle(),
    supabase.from("lesson_feedback_events").select("payload,created_at").eq("session_id", sessionId).eq("student_id", req.user!.userId).eq("event_type", "follow_heartbeat").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const session = unwrap(sessionResult) as { id: string; module_id: string } | null;
  if (!session) return res.status(409).json({ error: "This lesson is no longer live" });
  const previous = unwrap(previousResult) as { payload: { following?: boolean }; created_at: string } | null;
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
    teachingSuggestions: Array.isArray(ai.teachingSuggestions) ? ai.teachingSuggestions.filter((v): v is string => typeof v === "string") : classFallback(context, students).teachingSuggestions,
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
    const flags = allFlagsFrom(payload);
    return { askedAt: event.created_at, question: String(payload.question ?? ""), reply: String(payload.reply ?? ""), safetyFlags: flags.filter((flag): flag is LessonFeedbackSafetyFlag => flag !== "answer_seeking"), flags, misuse: flags.includes("answer_seeking") ? "answer_seeking" : null, reviewAvailable: payload.reviewAvailable !== false };
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
