import { z } from "zod";
import { created, handler, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { HUB_MAX_SOURCE_CHARS, generateHubSummary } from "@/lib/domain/learning-hub";

const schema = z.object({
  topic: z.string().trim().min(2).max(160),
  sourceContent: z.string().max(HUB_MAX_SOURCE_CHARS).default(""),
  style: z.enum(["BRIEF", "STANDARD", "DETAILED"]).default("STANDARD"),
});

/** POST /api/learning-hub/summary — summarise pasted content, or a topic. */
export const POST = handler(async (request: Request) => {
  const user = await requireUser();
  const body = await parseBody(request, schema);

  const summary = await generateHubSummary({
    userId: user.id,
    topic: body.topic,
    sourceContent: body.sourceContent,
    style: body.style,
  });

  return created(summary);
});
