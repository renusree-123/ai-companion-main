import { z } from "zod";
import { created, handler, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { HUB_MAX_SOURCE_CHARS, generateHubQuiz } from "@/lib/domain/learning-hub";

const schema = z.object({
  topic: z.string().trim().min(2).max(160),
  questionCount: z.number().int().min(1).max(15).default(5),
  difficulty: z.enum(["EASY", "MEDIUM", "HARD", "MIXED"]).default("MIXED"),
  sourceContent: z.string().max(HUB_MAX_SOURCE_CHARS).default(""),
});

/** POST /api/learning-hub/quiz — generate an MCQ quiz on any topic. */
export const POST = handler(async (request: Request) => {
  const user = await requireUser();
  const body = await parseBody(request, schema);

  const quiz = await generateHubQuiz({
    userId: user.id,
    topic: body.topic,
    questionCount: body.questionCount,
    difficulty: body.difficulty,
    sourceContent: body.sourceContent,
  });

  return created(quiz);
});
