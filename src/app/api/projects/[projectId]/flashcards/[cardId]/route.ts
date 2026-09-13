import { z } from "zod";
import { db } from "@/lib/db";
import { handler, ok, parseBody } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { assertProjectAccess } from "@/lib/auth/ownership";
import { notFound } from "@/lib/errors";

type Params = { params: Promise<{ projectId: string; cardId: string }> };

const updateSchema = z.object({
  front: z.string().min(1).max(1000).trim().optional(),
  back: z.string().min(1).max(2000).trim().optional(),
  hint: z.string().max(500).trim().optional(),
  status: z.enum(["NEW", "LEARNING", "KNOWN"]).optional(),
});

const reviewSchema = z.object({
  correct: z.boolean(),
});

async function assertCardAccess(userId: string, projectId: string, cardId: string) {
  const card = await db.flashcard.findFirst({ where: { id: cardId, projectId, userId } });
  if (!card) throw notFound("Flashcard");
  return card;
}

export const PATCH = handler(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const { projectId, cardId } = await params;
  await assertProjectAccess(user.id, projectId);
  await assertCardAccess(user.id, projectId, cardId);

  const body = await parseBody(request, updateSchema);
  const card = await db.flashcard.update({ where: { id: cardId }, data: body });
  return ok(card);
});

export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { projectId, cardId } = await params;
  await assertProjectAccess(user.id, projectId);
  await assertCardAccess(user.id, projectId, cardId);

  await db.flashcard.delete({ where: { id: cardId } });
  return ok({ deleted: true });
});

export const PUT = handler(async (request: Request, { params }: Params) => {
  const user = await requireUser();
  const { projectId, cardId } = await params;
  await assertProjectAccess(user.id, projectId);
  const card = await assertCardAccess(user.id, projectId, cardId);

  const body = await parseBody(request, reviewSchema);

  const correctCount = card.correctCount + (body.correct ? 1 : 0);
  const reviewCount = card.reviewCount + 1;
  const accuracy = correctCount / reviewCount;

  let status: string;
  if (accuracy >= 0.8 && reviewCount >= 3) status = "KNOWN";
  else if (reviewCount >= 1) status = "LEARNING";
  else status = "NEW";

  const updated = await db.flashcard.update({
    where: { id: cardId },
    data: {
      correctCount,
      reviewCount,
      status,
      lastReviewedAt: new Date(),
    },
  });
  return ok(updated);
});
