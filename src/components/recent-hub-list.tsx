"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge, Card, EmptyState, SectionTitle, formatPercent, formatRelative } from "./ui";

interface HubArtifactSummary {
  id: string;
  kind: string;
  topic: string;
  createdAt: Date;
  questionCount: number;
  correctCount: number;
  score: number;
  completedAt: Date | null;
}

const KIND_LABEL: Record<string, string> = {
  QUIZ: "Quiz",
  SUMMARY: "Summary",
  EXPLANATION: "Explanation",
};

export function RecentHubList({ initialItems }: { initialItems: HubArtifactSummary[] }) {
  const router = useRouter();
  const [items, setItems] = useState<HubArtifactSummary[]>(initialItems);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/learning-hub/items/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => prev.filter((item) => item.id !== id));
        router.refresh();
      }
    } catch {
      // Ignore network errors
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Card>
      <SectionTitle hint="Your last 10 Hub results">Recent</SectionTitle>
      {items.length === 0 ? (
        <EmptyState
          icon="✨"
          title="Nothing yet"
          body="Generate a quiz, a summary or an explanation and it will be listed here."
        />
      ) : (
        <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "grid", gap: 12 }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                position: "relative",
                paddingRight: 32,
              }}
            >
              <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                <Badge tone="info">{KIND_LABEL[item.kind] ?? item.kind}</Badge>
                {item.completedAt ? (
                  <Badge tone={item.score >= 0.8 ? "success" : item.score >= 0.5 ? "warning" : "danger"}>
                    {formatPercent(item.score)}
                  </Badge>
                ) : null}
              </div>
              <div style={{ fontSize: 12.8, fontWeight: 560, marginTop: 4, lineHeight: 1.45 }}>
                {item.topic}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--text-subtle)", marginTop: 2 }}>
                {item.kind === "QUIZ" && item.questionCount > 0
                  ? `${item.correctCount}/${item.questionCount} · ${formatRelative(new Date(item.createdAt))}`
                  : formatRelative(new Date(item.createdAt))}
              </div>
              <button
                type="button"
                aria-label={`Delete ${item.topic}`}
                onClick={() => handleDelete(item.id)}
                disabled={deletingId === item.id}
                title="Delete recent item"
                style={{
                  position: "absolute",
                  top: 2,
                  right: 0,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text-muted)",
                  fontSize: 14,
                  opacity: deletingId === item.id ? 0.4 : 0.7,
                  padding: "2px 4px",
                  borderRadius: 4,
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
