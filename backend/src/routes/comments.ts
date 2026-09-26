import { randomUUID } from "node:crypto";
import { Router } from "express";
import { moduleForUser, studentInClassroom } from "../access.js";
import { emitQuestionCommentCreated } from "../sockets.js";
import { supabase } from "../supabase.js";
import {
  toComment,
  toAttempt,
  toSubmission,
  toQuestionComment,
  unwrap,
  type AttemptRow,
  type CommentRow,
  type CodeSubmissionRow,
  type ExerciseRow,
  type QuestionCommentRow,
} from "../rows.js";
import type {
  CreateAttemptRequest,
  CreateCommentRequest,
  CreateSubmissionRequest,
  CreateQuestionCommentRequest,
} from "../../../shared/types.js";
export const commentsRouter = Router();
async function ownedExercise(
  id: string,
  classroomId: string,
  role: "student" | "teacher",
): Promise<ExerciseRow | null> {
  const e = unwrap(
    await supabase
      .from("code_exercises")
      .select("*")
      .eq("id", id)
      .maybeSingle(),
  ) as ExerciseRow | null;
  if (!e) return null;
  const q = unwrap(
    await supabase
      .from("questions")
      .select("section_id")
      .eq("id", e.question_id)
      .maybeSingle(),
  ) as { section_id: string } | null;
  const s =
    q &&
    (unwrap(
      await supabase
        .from("sections")
        .select("module_id")
        .eq("id", q.section_id)
        .maybeSingle(),
    ) as { module_id: string } | null);
  return s && (await moduleForUser(s.module_id, classroomId, role)) ? e : null;
}
async function questionModuleForUser(
  questionId: string,
  classroomId: string,
  role: "student" | "teacher",
): Promise<string | null> {
  const question = unwrap(
    await supabase
      .from("questions")
      .select("section_id")
      .eq("id", questionId)
      .maybeSingle(),
  ) as { section_id: string } | null;
  if (!question) return null;
  const section = unwrap(
    await supabase
      .from("sections")
      .select("module_id")
      .eq("id", question.section_id)
      .maybeSingle(),
  ) as { module_id: string } | null;
  return section && (await moduleForUser(section.module_id, classroomId, role))
    ? section.module_id
    : null;
}
commentsRouter.post("/attempts", async (req, res) => {
  const b = (req.body ?? {}) as Partial<CreateAttemptRequest>;
  if (
    req.user!.role !== "student" ||
    typeof b.questionId !== "string" ||
    typeof b.answer !== "string"
  )
    return res
      .status(400)
      .json({ error: "Students must provide questionId and answer" });
  const question = unwrap(
    await supabase
      .from("questions")
      .select("id,section_id,answer_key,kind")
      .eq("id", b.questionId)
      .maybeSingle(),
  ) as { id: string; section_id: string; answer_key: string | null; kind: string } | null;
  const section =
    question &&
    (unwrap(
      await supabase
        .from("sections")
        .select("module_id")
        .eq("id", question.section_id)
        .maybeSingle(),
    ) as { module_id: string } | null);
  if (
    !question ||
    !section ||
    !(await moduleForUser(
      section.module_id,
      req.user!.classroomId,
      req.user!.role,
    ))
  )
    return res.status(404).json({ error: "Question not found" });
  const isCorrect =
    question.kind === "long" || question.answer_key === null
      ? null
      : question.answer_key.trim().toLowerCase() ===
        b.answer.trim().toLowerCase();
  const checkedAt = new Date().toISOString();
  const row = unwrap(
    await supabase
      .from("attempts")
      .insert({
        id: randomUUID(),
        student_id: req.user!.userId,
        question_id: question.id,
        answer: b.answer,
        is_correct: isCorrect,
      })
      .select("*")
      .single(),
  );
  unwrap(
    await supabase
      .from("student_work")
      .upsert(
        {
          id: `${req.user!.userId}:${question.id}`,
          student_id: req.user!.userId,
          question_id: question.id,
          answer: b.answer,
          code: null,
          is_correct: isCorrect,
          checked_at: checkedAt,
          updated_at: checkedAt,
        },
        { onConflict: "student_id,question_id" },
      ),
  );
  res.status(201).json(toAttempt(row as AttemptRow));
});
commentsRouter.post("/submissions", async (req, res) => {
  const b = (req.body ?? {}) as Partial<CreateSubmissionRequest>;
  if (
    req.user!.role !== "student" ||
    typeof b.codeExerciseId !== "string" ||
    typeof b.code !== "string" ||
    (b.stdout !== undefined && typeof b.stdout !== "string") ||
    (b.stderr !== undefined && typeof b.stderr !== "string") ||
    (b.passed !== undefined &&
      b.passed !== null &&
      typeof b.passed !== "boolean")
  )
    return res.status(400).json({ error: "Invalid sandbox submission result" });
  if (
    !(await ownedExercise(
      b.codeExerciseId,
      req.user!.classroomId,
      req.user!.role,
    ))
  )
    return res.status(404).json({ error: "Code exercise not found" });
  const row = unwrap(
    await supabase
      .from("code_submissions")
      .insert({
        id: randomUUID(),
        student_id: req.user!.userId,
        code_exercise_id: b.codeExerciseId,
        code: b.code,
        stdout: b.stdout ?? "",
        stderr: b.stderr ?? "",
        passed: b.passed ?? null,
      })
      .select("*")
      .single(),
  );
  res.status(201).json(toSubmission(row as CodeSubmissionRow));
});
commentsRouter.get("/submissions/:id/comments", async (req, res) => {
  const submission = unwrap(
    await supabase
      .from("code_submissions")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle(),
  ) as { id: string; student_id: string; code_exercise_id: string } | null;
  if (
    !submission ||
    !(await ownedExercise(
      submission.code_exercise_id,
      req.user!.classroomId,
      req.user!.role,
    )) ||
    (req.user!.role === "student" && submission.student_id !== req.user!.userId)
  )
    return res.status(404).json({ error: "Submission not found" });
  const rows = unwrap(
    await supabase
      .from("comments")
      .select("*")
      .eq("submission_id", submission.id)
      .order("created_at"),
  ) as CommentRow[];
  res.json(rows.map(toComment));
});
commentsRouter.post("/comments", async (req, res) => {
  const b = (req.body ?? {}) as Partial<CreateCommentRequest>;
  if (
    typeof b.submissionId !== "string" ||
    typeof b.text !== "string" ||
    !b.text.trim() ||
    (b.lineStart !== undefined &&
      b.lineStart !== null &&
      (!Number.isInteger(b.lineStart) || b.lineStart < 1)) ||
    (b.lineEnd !== undefined &&
      b.lineEnd !== null &&
      (!Number.isInteger(b.lineEnd) || b.lineEnd < (b.lineStart ?? 1)))
  )
    return res.status(400).json({ error: "Invalid submission comment" });
  const submission = unwrap(
    await supabase
      .from("code_submissions")
      .select("*")
      .eq("id", b.submissionId)
      .maybeSingle(),
  ) as { student_id: string; code_exercise_id: string } | null;
  if (
    !submission ||
    !(await ownedExercise(
      submission.code_exercise_id,
      req.user!.classroomId,
      req.user!.role,
    )) ||
    (req.user!.role === "student" && submission.student_id !== req.user!.userId)
  )
    return res.status(404).json({ error: "Submission not found" });
  const row = unwrap(
    await supabase
      .from("comments")
      .insert({
        id: randomUUID(),
        submission_id: b.submissionId,
        author_id: req.user!.userId,
        text: b.text.trim(),
        line_start: b.lineStart ?? null,
        line_end: b.lineEnd ?? null,
      })
      .select("*")
      .single(),
  ) as CommentRow;
  res.status(201).json(toComment(row));
});

commentsRouter.get("/questions/:id/comments", async (req, res) => {
  const questionId = String(req.params.id);
  const requestedStudentId = req.query.studentId;
  const studentId =
    req.user!.role === "student"
      ? req.user!.userId
      : typeof requestedStudentId === "string"
        ? requestedStudentId
        : null;
  if (
    !studentId ||
    (req.user!.role === "student" && requestedStudentId !== undefined && requestedStudentId !== studentId) ||
    !(await studentInClassroom(studentId, req.user!.classroomId))
  )
    return res.status(403).json({ error: "Not allowed to view this conversation" });
  const moduleId = await questionModuleForUser(
    questionId,
    req.user!.classroomId,
    req.user!.role,
  );
  if (!moduleId)
    return res.status(404).json({ error: "Question not found" });
  const rows = unwrap(
    await supabase
      .from("question_comments")
      .select("*")
      .eq("question_id", questionId)
      .eq("student_id", studentId)
      .order("created_at"),
  ) as QuestionCommentRow[];
  res.json(rows.map(toQuestionComment));
});

commentsRouter.post("/questions/:id/comments", async (req, res) => {
  const questionId = String(req.params.id);
  const body = (req.body ?? {}) as Partial<CreateQuestionCommentRequest>;
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const studentId =
    req.user!.role === "student"
      ? req.user!.userId
      : typeof body.studentId === "string"
        ? body.studentId
        : null;
  if (!text || text.length > 4_000)
    return res.status(400).json({ error: "A comment must be between 1 and 4,000 characters" });
  if (!studentId || !(await studentInClassroom(studentId, req.user!.classroomId)))
    return res.status(403).json({ error: "Not allowed to comment for this student" });
  const moduleId = await questionModuleForUser(
    questionId,
    req.user!.classroomId,
    req.user!.role,
  );
  if (!moduleId)
    return res.status(404).json({ error: "Question not found" });
  if (req.user!.role === "student") {
    const teacherComment = unwrap(
      await supabase
        .from("question_comments")
        .select("id")
        .eq("question_id", questionId)
        .eq("student_id", studentId)
        .neq("author_id", studentId)
        .limit(1)
        .maybeSingle(),
    );
    if (!teacherComment)
      return res.status(403).json({ error: "A teacher must start this conversation" });
  }
  const row = unwrap(
    await supabase
      .from("question_comments")
      .insert({
        id: randomUUID(),
        question_id: questionId,
        student_id: studentId,
        author_id: req.user!.userId,
        text,
      })
      .select("*")
      .single(),
  ) as QuestionCommentRow;
  const comment = toQuestionComment(row);
  emitQuestionCommentCreated({
    type: "question_comment_created",
    classroomId: req.user!.classroomId,
    moduleId,
    comment,
  });
  res.status(201).json(comment);
});
