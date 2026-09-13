import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { submitHubQuiz } from "@/lib/domain/learning-hub";

type Params = { params: Promise<{ artifactId: string }> };

const schema = z.object({
  answers: z
    .array(
      z.object({
        index: z.number().int().min(0).max(50),
        selectedIndex: z.number().int().min(0).max(3).nullable(),
      }),
    )
    .max(50),
});

/**
 * POST /api/learning-hub/quiz/:artifactId/submit
 *
 * Grading happens here, against the answer key stored when the quiz was
 * generated — the client only reports which option it chose.
 */
export const POST = handler(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const { artifactId } = await params;
  const body = await parseBody(request, schema);

  const result = await submitHubQuiz({
    userId: user.id,
    artifactId,
    answers: body.answers,
  });

  return ok(result);
});
