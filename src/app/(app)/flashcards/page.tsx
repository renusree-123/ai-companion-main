import { requireUserPage } from "@/lib/auth/session";
import { db } from "@/lib/db";
import { GlobalFlashcardsPanel } from "@/components/global-flashcards";

export default async function FlashcardsPage() {
  const user = await requireUserPage();

  const [cards, projects] = await Promise.all([
    db.flashcard.findMany({
      where: { userId: user.id },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.project.findMany({
      where: { userId: user.id, archivedAt: null },
      select: { id: true, name: true },
      orderBy: { lastAccessedAt: "desc" },
    }),
  ]);

  const serialized = cards.map((c) => ({
    id: c.id,
    projectId: c.projectId,
    projectName: c.project.name,
    front: c.front,
    back: c.back,
    hint: c.hint,
    status: c.status,
    reviewCount: c.reviewCount,
    correctCount: c.correctCount,
  }));

  return (
    <GlobalFlashcardsPanel
      projects={projects}
      initialCards={serialized}
    />
  );
}
