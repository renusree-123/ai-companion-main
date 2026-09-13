import { Suspense } from "react";
import { requireUserPage } from "@/lib/auth/session";
import { assertProjectAccess } from "@/lib/auth/ownership";
import { db } from "@/lib/db";
import { FlashcardsPanel } from "@/components/flashcards";
import { Card } from "@/components/ui";

type CardStatus = "NEW" | "LEARNING" | "KNOWN";

export default async function FlashcardsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await requireUserPage();
  const { projectId } = await params;
  await assertProjectAccess(user.id, projectId);

  const cards = await db.flashcard.findMany({
    where: { projectId, userId: user.id },
    orderBy: { createdAt: "desc" },
  });

  const serialized = cards.map((c) => ({
    ...c,
    status: c.status as CardStatus,
    lastReviewedAt: c.lastReviewedAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  }));

  return (
    <Suspense fallback={<Card padding={40}>Loading…</Card>}>
      <FlashcardsPanel projectId={projectId} initialCards={serialized} />
    </Suspense>
  );
}
