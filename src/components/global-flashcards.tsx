"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  SectionTitle,
  Stat,
  StatGrid,
  Divider,
  inputStyle,
} from "@/components/ui";
import type { CSSProperties } from "react";

interface Project {
  id: string;
  name: string;
}

interface FlashcardItem {
  id: string;
  projectId: string;
  projectName: string;
  front: string;
  back: string;
  hint: string;
  status: string;
  reviewCount: number;
  correctCount: number;
}

interface GlobalFlashcardsPanelProps {
  projects: Project[];
  initialCards: FlashcardItem[];
}

// ---------------------------------------------------------------------------
// Add card form (inline, with project picker)
// ---------------------------------------------------------------------------

function AddCardForm({
  projects,
  onSave,
  onCancel,
}: {
  projects: Project[];
  onSave: (card: FlashcardItem) => void;
  onCancel: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [hint, setHint] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    resize: "vertical" as const,
    minHeight: 68,
    fontFamily: "inherit",
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !front.trim() || !back.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ front: front.trim(), back: back.trim(), hint: hint.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Failed to save");
      }
      const { data } = await res.json();
      const project = projects.find((p) => p.id === projectId);
      onSave({ ...data, projectName: project?.name ?? "" });
      setFront("");
      setBack("");
      setHint("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Card padding={20}>
      <SectionTitle>Add Flashcard</SectionTitle>
      {error && <div style={{ marginBottom: 12 }}><Alert tone="danger">{error}</Alert></div>}
      <form onSubmit={handleSubmit}>
        <Field label="Project" required>
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
            required
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Front (question / term)" required>
          <textarea
            value={front}
            onChange={(e) => setFront(e.target.value)}
            style={textareaStyle}
            placeholder="What is the capital of France?"
            required
          />
        </Field>
        <Field label="Back (answer / definition)" required>
          <textarea
            value={back}
            onChange={(e) => setBack(e.target.value)}
            style={textareaStyle}
            placeholder="Paris"
            required
          />
        </Field>
        <Field label="Hint (optional)">
          <input
            type="text"
            value={hint}
            onChange={(e) => setHint(e.target.value)}
            style={inputStyle}
            placeholder="Think about Europe…"
          />
        </Field>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <Button variant="secondary" size="sm" type="button" onClick={onCancel}>Cancel</Button>
          <Button type="submit" size="sm" disabled={saving || !front.trim() || !back.trim() || !projectId}>
            {saving ? "Saving…" : "Add card"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function GlobalFlashcardsPanel({ projects, initialCards }: GlobalFlashcardsPanelProps) {
  const [cards, setCards] = useState<FlashcardItem[]>(initialCards);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "NEW" | "LEARNING" | "KNOWN">("ALL");

  const total = cards.length;
  const known = cards.filter((c) => c.status === "KNOWN").length;
  const learning = cards.filter((c) => c.status === "LEARNING").length;
  const newCount = cards.filter((c) => c.status === "NEW").length;

  // Group by project
  const byProject = new Map<string, { projectId: string; projectName: string; cards: FlashcardItem[] }>();
  const filtered = filter === "ALL" ? cards : cards.filter((c) => c.status === filter);
  for (const card of filtered) {
    const key = card.projectId;
    if (!byProject.has(key)) {
      byProject.set(key, { projectId: card.projectId, projectName: card.projectName, cards: [] });
    }
    byProject.get(key)!.cards.push(card);
  }

  const handleSaved = useCallback((card: FlashcardItem) => {
    setCards((prev) => [card, ...prev]);
    setShowForm(false);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 680, letterSpacing: "-0.02em" }}>
            Flashcards
          </h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
            All your cards across every project
          </p>
        </div>
        {projects.length > 0 && (
          <Button onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Cancel" : "+ Add Card"}
          </Button>
        )}
      </div>

      {/* Add form */}
      {showForm && (
        <AddCardForm
          projects={projects}
          onSave={handleSaved}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* No projects yet */}
      {projects.length === 0 && (
        <Card padding={40}>
          <EmptyState
            icon="📁"
            title="No projects yet"
            body="Create a project first, then add flashcards to it."
            action={<Button href="/spaces">Go to Spaces</Button>}
          />
        </Card>
      )}

      {/* Stats */}
      {total > 0 && (
        <Card padding={18}>
          <StatGrid min={110}>
            <Stat label="Total" value={total} />
            <Stat label="Known" value={known} tone="success" />
            <Stat label="Learning" value={learning} tone="warning" />
            <Stat label="New" value={newCount} />
          </StatGrid>
        </Card>
      )}

      {/* Filter tabs */}
      {total > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["ALL", "NEW", "LEARNING", "KNOWN"] as const).map((f) => {
            const count = f === "ALL" ? total
              : f === "NEW" ? newCount
              : f === "LEARNING" ? learning
              : known;
            return (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  padding: "4px 12px",
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 550,
                  border: "1px solid",
                  borderColor: filter === f ? "var(--accent)" : "var(--border)",
                  background: filter === f ? "var(--accent-soft)" : "transparent",
                  color: filter === f ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                }}
              >
                {f} ({count})
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {projects.length > 0 && total === 0 && !showForm && (
        <Card padding={40}>
          <EmptyState
            icon="🃏"
            title="No flashcards yet"
            body="Click '+ Add Card' above to create your first card, or open any project's Flashcards tab."
            action={<Button onClick={() => setShowForm(true)}>+ Add Card</Button>}
          />
        </Card>
      )}

      {/* Filtered empty */}
      {total > 0 && byProject.size === 0 && (
        <Card padding={30}>
          <EmptyState title={`No ${filter.toLowerCase()} cards`} />
        </Card>
      )}

      {/* Cards grouped by project */}
      {byProject.size > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {[...byProject.values()].map(({ projectId, projectName, cards: projectCards }) => {
            const toStudy = projectCards.filter((c) => c.status !== "KNOWN").length;
            return (
              <Card key={projectId} padding={18}>
                <SectionTitle
                  action={
                    <Button href={`/projects/${projectId}/flashcards`} variant="secondary" size="sm">
                      {toStudy > 0 ? `Study (${toStudy})` : "Open"}
                    </Button>
                  }
                >
                  {projectName}
                </SectionTitle>

                <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                  <Badge tone="default">{projectCards.length} cards</Badge>
                  {projectCards.filter((c) => c.status === "KNOWN").length > 0 && (
                    <Badge tone="success">{projectCards.filter((c) => c.status === "KNOWN").length} known</Badge>
                  )}
                  {toStudy > 0 && <Badge tone="warning">{toStudy} to study</Badge>}
                </div>

                <Divider margin={10} />

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {projectCards.slice(0, 5).map((card) => (
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
                          card.status === "KNOWN" ? "success"
                          : card.status === "LEARNING" ? "warning"
                          : "default"
                        }
                      >
                        {card.status}
                      </Badge>
                      <span style={{ flex: 1, fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {card.front}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                        {card.back.length > 40 ? card.back.slice(0, 40) + "…" : card.back}
                      </span>
                    </div>
                  ))}
                  {projectCards.length > 5 && (
                    <Link
                      href={`/projects/${projectId}/flashcards`}
                      style={{ fontSize: 12.5, color: "var(--text-muted)", padding: "4px 2px" }}
                    >
                      +{projectCards.length - 5} more →
                    </Link>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
