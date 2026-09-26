import { Router } from "express";
import { ArithmeticError, parseArithmetic } from "../../../math/arithmetic.js";
import { supabase } from "../supabase.js";
import { unwrap } from "../rows.js";
import type {
  ValidateMathRequest,
  ValidateMathResponse,
} from "../../../shared/types.js";

export const mathRouter = Router();

mathRouter.post("/validate", async (req, res) => {
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
        "kind, math_expected_result, math_tolerance, sections!inner(modules!inner(classroom_id))",
      )
      .eq("id", body.questionId)
      .eq("sections.modules.classroom_id", req.user!.classroomId)
      .maybeSingle(),
  ) as {
    kind: string;
    math_expected_result: number | null;
    math_tolerance: number | null;
  } | null;
  if (!question) return res.status(404).json({ error: "Question not found" });
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
    const response: ValidateMathResponse = {
      value,
      isCorrect:
        Math.abs(value - question.math_expected_result) <=
        question.math_tolerance,
    };
    res.json(response);
  } catch (error) {
    if (error instanceof ArithmeticError)
      return res.status(400).json({ error: "Invalid arithmetic expression" });
    throw error;
  }
});
