import { Router } from "express";
import { ArithmeticError, parseArithmetic } from "../../../math/arithmetic.js";
import { supabase } from "../supabase.js";
import { unwrap } from "../rows.js";
import { moduleForUser } from "../access.js";
import type {
  ValidateMathRequest,
  ValidateMathResponse,
} from "../../../shared/types.js";

export const mathRouter = Router();

mathRouter.post("/validate", async (req, res) => {
  if (req.user!.role !== "student")
    return res.status(403).json({ error: "Only students can check answers" });
  const body = req.body as Partial<ValidateMathRequest> | null;
  if (
    !body ||
    typeof body.questionId !== "string" ||
    !body.questionId.trim() ||
    body.questionId.length > 200 ||
    typeof body.expression !== "string" ||
    !body.expression.trim() ||
    body.expression.length > 1_000
  ) {
    return res
      .status(400)
      .json({ error: "questionId and expression are invalid" });
  }

  // The joined lookup prevents a member from validating a question from another classroom.
  const question = unwrap(
    await supabase
      .from("questions")
      .select(
        "kind, math_expected_result, math_tolerance, sections!inner(module_id)",
      )
      .eq("id", body.questionId)
      .maybeSingle(),
  ) as {
    kind: string;
    math_expected_result: number | null;
    math_tolerance: number | null;
    sections: { module_id: string };
  } | null;
  if (
    !question ||
    !(await moduleForUser(
      question.sections.module_id,
      req.user!.classroomId,
      req.user!.role,
    ))
  )
    return res.status(404).json({ error: "Question not found" });
  if (
    question.kind !== "math" ||
    typeof question.math_expected_result !== "number" ||
    !Number.isFinite(question.math_expected_result) ||
    typeof question.math_tolerance !== "number" ||
    !Number.isFinite(question.math_tolerance)
  ) {
    return res
      .status(400)
      .json({ error: "Question is not a configured math question" });
  }

  try {
    const value = parseArithmetic(body.expression);
    const checkedAt = new Date().toISOString();
    const isCorrect =
      Math.abs(value - question.math_expected_result) <=
      question.math_tolerance;
    unwrap(
      await supabase
        .from("student_work")
        .upsert(
          {
            id: `${req.user!.userId}:${body.questionId}`,
            student_id: req.user!.userId,
            question_id: body.questionId,
            answer: body.expression,
            code: null,
            is_correct: isCorrect,
            checked_at: checkedAt,
            updated_at: checkedAt,
          },
          { onConflict: "student_id,question_id" },
        ),
    );
    const response: ValidateMathResponse = {
      value,
      isCorrect,
      checkedAt,
    };
    res.json(response);
  } catch (error) {
    if (error instanceof ArithmeticError)
      return res.status(400).json({ error: "Invalid arithmetic expression" });
    throw error;
  }
});
