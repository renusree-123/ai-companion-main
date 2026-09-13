import { z } from "zod";
import { created, handler, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { HUB_MAX_SOURCE_CHARS, generateHubExplanation } from "@/lib/domain/learning-hub";

const schema = z.object({
  topic: z.string().trim().min(2).max(160),
  level: z.enum(["BEGINNER", "INTERMEDIATE", "ADVANCED"]).default("BEGINNER"),
  sourceContent: z.string().max(HUB_MAX_SOURCE_CHARS).default(""),
});

/** POST /api/learning-hub/explain — explain any topic simply. */
export const POST = handler(async (request: Request) => {
  const user = await requireUser();
  const body = await parseBody(request, schema);

  const explanation = await generateHubExplanation({
    userId: user.id,
    topic: body.topic,
    level: body.level,
    sourceContent: body.sourceContent,
  });

  return created(explanation);
});
