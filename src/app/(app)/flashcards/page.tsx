import Link from "next/link";
import { requireUserPage } from "@/lib/auth/session";
import { db } from "@/lib/db";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  SectionTitle,
  Stat,
  StatGrid,
} from "@/components/ui";

export default async function FlashcardsPage() {
  const user = await requireUserPage();

  const cards = await db.flashcard.findMany({
    where: { userId: user.id },
    include: { project: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const byProject = new Map<string, { projectId: string; projectName: string; cards: typeof cards }>();
  for (const card of cards) {
    const key = card.projectId;
    if (!byProject.has(key)) {
      byProject.set(key, { projectId: card.projectId, projectName: card.project.name, cards: [] });
    }
    byProject.get(key)!.cards.push(card);
  }

  const total = cards.length;
  const known = cards.filter((c) => c.status === "KNOWN").length;
  const learning = cards.filter((c) => c.status === "LEARNING").length;
  const newCards = cards.filter((c) => c.status === "NEW").length;
  const toStudy = cards.filter((c) => c.status !== "KNOWN").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 680, letterSpacing: "-0.02em" }}>
            Flashcards
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            All your flashcards across every project
          </p>
        </div>
      </div>

      {total > 0 && (
        <Card padding={18}>
          <StatGrid min={110}>
            <Stat label="Total" value={total} />
            <Stat label="Known" value={known} tone="success" />
            <Stat label="Learning" value={learning} tone="warning" />
            <Stat label="New" value={newCards} />
          </StatGrid>
        </Card>
      )}

      {total === 0 ? (
        <Card padding={40}>
          <EmptyState
            icon="🃏"
            title="No flashcards yet"
            body="Go into any project and open the Flashcards tab to create your first cards."
          />
        </Card>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {[...byProject.values()].map(({ projectId, projectName, cards: projectCards }) => {
            const pKnown = projectCards.filter((c) => c.status === "KNOWN").length;
            const pStudy = projectCards.filter((c) => c.status !== "KNOWN").length;

            return (
              <Card key={projectId} padding={18}>
                <SectionTitle
                  action={
                    <Button
                      href={`/projects/${projectId}/flashcards`}
                      variant="secondary"
                      size="sm"
                    >
                      {pStudy > 0 ? `Study (${pStudy})` : "View all"}
                    </Button>
                  }
                >
                  {projectName}
                </SectionTitle>

                <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                  <Badge tone="default">{projectCards.length} cards</Badge>
                  {pKnown > 0 && <Badge tone="success">{pKnown} known</Badge>}
                  {pStudy > 0 && <Badge tone="warning">{pStudy} to study</Badge>}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {projectCards.slice(0, 4).map((card) => (
                    <div
                      key={card.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 11px",
                        background: "var(--surface-2, var(--surface))",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    >
                      <Badge
                        tone={
                          card.status === "KNOWN"
                            ? "success"
                            : card.status === "LEARNING"
                            ? "warning"
                            : "default"
                        }
                      >
                        {card.status}
                      </Badge>
                      <span
                        style={{
                          flex: 1,
                          fontSize: 13,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {card.front}
                      </span>
                    </div>
                  ))}
                  {projectCards.length > 4 && (
                    <Link
                      href={`/projects/${projectId}/flashcards`}
                      style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "4px 0" }}
                    >
                      +{projectCards.length - 4} more cards →
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {total > 0 && toStudy > 0 && (
        <p style={{ fontSize: 12.5, color: "var(--text-muted)", textAlign: "center" }}>
          Open a project's Flashcards tab to start a study session.
        </p>
      )}
    </div>
  );
}
