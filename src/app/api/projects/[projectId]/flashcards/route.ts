import { z } from "zod";
import { db } from "@/lib/db";
import { created, handler, ok, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { assertProjectAccess } from "@/lib/auth/ownership";

type Params = { params: Promise<{ projectId: string }> };

const createSchema = z.object({
  front: z.string().min(1).max(1000).trim(),
  back: z.string().min(1).max(2000).trim(),
  hint: z.string().max(500).trim().default(""),
  conceptId: z.string().optional(),
});

export const GET = handler(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { projectId } = await params;
  await assertProjectAccess(user.id, projectId);

  const cards = await db.flashcard.findMany({
    where: { projectId, userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return ok(cards);
});

export const POST = handler(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const { projectId } = await params;
  await assertProjectAccess(user.id, projectId);

  const body = await parseBody(request, createSchema);

  const card = await db.flashcard.create({
    data: {
      projectId,
      userId: user.id,
      front: body.front,
      back: body.back,
      hint: body.hint,
      conceptId: body.conceptId,
    },
  });

  return created(card);
});
