import { Router } from "express";
import { moduleInClassroom } from "../access.js";
import type { AiHintRequest, AiHintResponse } from "../../../shared/types.js";

export const aiRouter = Router();

// MOCKED: returns a placeholder. The OpenAI client (src/openai.ts) is scaffolded but NOT wired in.
aiRouter.post("/hint", async (req, res) => {
  const { moduleId, studentId, question } = (req.body ??
    {}) as Partial<AiHintRequest>;
  if (
    typeof moduleId !== "string" ||
    typeof studentId !== "string" ||
    typeof question !== "string"
  ) {
    res
      .status(400)
      .json({ error: "moduleId, studentId and question are required" });
    return;
  }
  if (
    req.user!.role !== "student" ||
    studentId !== req.user!.userId ||
    !(await moduleInClassroom(moduleId, req.user!.classroomId))
  ) {
    res.status(404).json({ error: "Module not found" });
    return;
  }

  // --- Real implementation would go here (follow-up work) ------------------------------
  // import { openai } from '../openai.js';   // NOTE: throws at import time if OPENAI_API_KEY is unset
  //
  // const completion = await openai.chat.completions.create({
  //   model: 'gpt-4o-mini',
  //   messages: [
  //     { role: 'system', content: 'You are a patient coding tutor. Give hints, never full solutions.' },
  //     // TODO: load the module content by moduleId and include it as context
  //     { role: 'user', content: question },
  //   ],
  // });
  // const reply = completion.choices[0]?.message?.content ?? '';
  // --------------------------------------------------------------------------------------

  const body: AiHintResponse = {
    reply: "This is a placeholder hint for: " + question,
  };
  res.json(body);
});
