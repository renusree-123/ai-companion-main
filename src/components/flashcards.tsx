"use client";

import { useState, useCallback, CSSProperties } from "react";
import {
  Card,
  SectionTitle,
  Button,
  Badge,
  EmptyState,
  Alert,
  Field,
  inputStyle,
  Stat,
  StatGrid,
  Divider,
} from "@/components/ui";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CardStatus = "NEW" | "LEARNING" | "KNOWN";

interface FlashcardData {
  id: string;
  front: string;
  back: string;
  hint: string;
  status: CardStatus;
  reviewCount: number;
  correctCount: number;
  lastReviewedAt: string | null;
  createdAt: string;
}

interface FlashcardsPanelProps {
  projectId: string;
  initialCards: FlashcardData[];
}

// ---------------------------------------------------------------------------
// Study Mode
// ---------------------------------------------------------------------------

function StudyMode({
  cards,
  onReview,
  onExit,
}: {
  cards: FlashcardData[];
  onReview: (cardId: string, correct: boolean) => Promise<void>;
  onExit: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [done, setDone] = useState(false);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [loading, setLoading] = useState(false);

  const current = cards[index];

  async function handleAnswer(correct: boolean) {
    setLoading(true);
    await onReview(current.id, correct);
    if (correct) setSessionCorrect((n) => n + 1);
    setLoading(false);

    const next = index + 1;
    if (next >= cards.length) {
      setDone(true);
    } else {
      setIndex(next);
      setFlipped(false);
      setShowHint(false);
    }
  }

  if (done) {
    return (
      <Card padding={40} style={{ textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
        <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 650 }}>Session complete!</h2>
        <p style={{ margin: "0 0 20px", color: "var(--text-muted)", fontSize: 14 }}>
          {sessionCorrect} / {cards.length} correct
        </p>
        <StatGrid min={100}>
          <Stat label="Correct" value={sessionCorrect} tone="success" />
          <Stat label="Incorrect" value={cards.length - sessionCorrect} tone={cards.length - sessionCorrect > 0 ? "danger" : "default"} />
          <Stat label="Accuracy" value={`${Math.round((sessionCorrect / cards.length) * 100)}%`} />
        </StatGrid>
        <div style={{ marginTop: 24 }}>
          <Button onClick={onExit}>Back to Flashcards</Button>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ maxWidth: 580, margin: "0 auto" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 13, color: "var(--text-muted)" }}>
          Card {index + 1} of {cards.length}
        </span>
        <Button variant="ghost" size="sm" onClick={onExit}>
          Exit study
        </Button>
      </div>

      {/* Progress bar */}
      <div
        style={{
          height: 4,
          borderRadius: 4,
          background: "var(--border)",
          marginBottom: 24,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${((index) / cards.length) * 100}%`,
            background: "var(--accent)",
            transition: "width 300ms ease",
          }}
        />
      </div>

      {/* Card face */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: 40,
          boxShadow: "var(--shadow-sm)",
          minHeight: 240,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          cursor: flipped ? "default" : "pointer",
          userSelect: "none",
          position: "relative",
        }}
        onClick={() => !flipped && setFlipped(true)}
      >
        {!flipped && (
          <span
            style={{
              position: "absolute",
              top: 12,
              right: 14,
              fontSize: 11.5,
              color: "var(--text-muted)",
            }}
          >
            click to reveal
          </span>
        )}

        <Badge
          tone={
            current.status === "KNOWN"
              ? "success"
              : current.status === "LEARNING"
              ? "warning"
              : "default"
          }
        >
          {current.status}
        </Badge>

        <div style={{ marginTop: 20, marginBottom: 12 }}>
          <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", fontWeight: 550 }}>
            {flipped ? "Answer" : "Question"}
          </p>
          <p style={{ margin: "8px 0 0", fontSize: 18, fontWeight: 600, lineHeight: 1.5 }}>
            {flipped ? current.back : current.front}
          </p>
        </div>

        {!flipped && current.hint && (
          <div style={{ marginTop: 12 }}>
            {showHint ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
                Hint: {current.hint}
              </p>
            ) : (
              <button
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--accent)",
                  fontSize: 12.5,
                  cursor: "pointer",
                  padding: 0,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  setShowHint(true);
                }}
              >
                Show hint
              </button>
            )}
          </div>
        )}
      </div>

      {/* Answer buttons */}
      {flipped && (
        <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
          <Button
            variant="danger"
            full
            disabled={loading}
            onClick={() => handleAnswer(false)}
          >
            ✗ Incorrect
          </Button>
          <Button
            variant="primary"
            full
            disabled={loading}
            onClick={() => handleAnswer(true)}
          >
            ✓ Correct
          </Button>
        </div>
      )}

      {!flipped && (
        <p style={{ textAlign: "center", fontSize: 12.5, color: "var(--text-muted)", marginTop: 12 }}>
          Tap the card to flip it
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card Form
// ---------------------------------------------------------------------------

function CardForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: FlashcardData;
  onSave: (data: { front: string; back: string; hint: string }) => Promise<void>;
  onCancel: () => void;
}) {
  const [front, setFront] = useState(initial?.front ?? "");
  const [back, setBack] = useState(initial?.back ?? "");
  const [hint, setHint] = useState(initial?.hint ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!front.trim() || !back.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await onSave({ front: front.trim(), back: back.trim(), hint: hint.trim() });
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  const textareaStyle: CSSProperties = {
    ...inputStyle,
    resize: "vertical",
    minHeight: 72,
    fontFamily: "inherit",
  };

  return (
    <Card padding={20}>
      <SectionTitle>{initial ? "Edit Card" : "New Flashcard"}</SectionTitle>
      {error && <div style={{ marginBottom: 14 }}><Alert tone="danger">{error}</Alert></div>}
      <form onSubmit={handleSubmit}>
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
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 4 }}>
          <Button variant="secondary" size="sm" onClick={onCancel} type="button">
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={saving || !front.trim() || !back.trim()}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add card"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Single card row
// ---------------------------------------------------------------------------

function CardRow({
  card,
  onEdit,
  onDelete,
}: {
  card: FlashcardData;
  onEdit: (card: FlashcardData) => void;
  onDelete: (cardId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 14px",
          cursor: "pointer",
          background: "var(--surface)",
        }}
        onClick={() => setExpanded((x) => !x)}
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
        <span style={{ flex: 1, fontSize: 13.5, fontWeight: 550, lineHeight: 1.4 }}>
          {card.front}
        </span>
        {card.reviewCount > 0 && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {card.correctCount}/{card.reviewCount}
          </span>
        )}
        <span style={{ fontSize: 16, color: "var(--text-muted)" }}>{expanded ? "▲" : "▼"}</span>
      </div>

      {expanded && (
        <div
          style={{
            padding: "12px 14px 14px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2, var(--surface))",
          }}
        >
          <p style={{ margin: "0 0 6px", fontSize: 12, color: "var(--text-muted)", fontWeight: 550 }}>
            Answer
          </p>
          <p style={{ margin: "0 0 10px", fontSize: 13.5, lineHeight: 1.55 }}>{card.back}</p>
          {card.hint && (
            <p style={{ margin: "0 0 12px", fontSize: 12.5, color: "var(--text-muted)", fontStyle: "italic" }}>
              Hint: {card.hint}
            </p>
          )}
          <div style={{ display: "flex", gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => onEdit(card)}>
              Edit
            </Button>
            <Button variant="danger" size="sm" onClick={() => onDelete(card.id)}>
              Delete
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

type View = "list" | "study" | "add" | "edit";

export function FlashcardsPanel({ projectId, initialCards }: FlashcardsPanelProps) {
  const [cards, setCards] = useState<FlashcardData[]>(initialCards);
  const [view, setView] = useState<View>("list");
  const [editing, setEditing] = useState<FlashcardData | null>(null);
  const [filter, setFilter] = useState<CardStatus | "ALL">("ALL");
  const [error, setError] = useState<string | null>(null);

  const filtered =
    filter === "ALL" ? cards : cards.filter((c) => c.status === filter);

  const stats = {
    total: cards.length,
    known: cards.filter((c) => c.status === "KNOWN").length,
    learning: cards.filter((c) => c.status === "LEARNING").length,
    newCards: cards.filter((c) => c.status === "NEW").length,
  };

  const studyQueue = cards.filter((c) => c.status !== "KNOWN");

  // ---------------------------------------------------------------------------
  // API helpers
  // ---------------------------------------------------------------------------

  const addCard = useCallback(
    async (data: { front: string; back: string; hint: string }) => {
      const res = await fetch(`/api/projects/${projectId}/flashcards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("failed");
      const { data: card } = await res.json();
      setCards((prev) => [card, ...prev]);
      setView("list");
    },
    [projectId],
  );

  const editCard = useCallback(
    async (data: { front: string; back: string; hint: string }) => {
      if (!editing) return;
      const res = await fetch(`/api/projects/${projectId}/flashcards/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("failed");
      const { data: updated } = await res.json();
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setEditing(null);
      setView("list");
    },
    [projectId, editing],
  );

  const deleteCard = useCallback(
    async (cardId: string) => {
      if (!confirm("Delete this flashcard?")) return;
      const res = await fetch(`/api/projects/${projectId}/flashcards/${cardId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Failed to delete card.");
        return;
      }
      setCards((prev) => prev.filter((c) => c.id !== cardId));
    },
    [projectId],
  );

  const reviewCard = useCallback(
    async (cardId: string, correct: boolean) => {
      const res = await fetch(`/api/projects/${projectId}/flashcards/${cardId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correct }),
      });
      if (!res.ok) return;
      const { data: updated } = await res.json();
      setCards((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    },
    [projectId],
  );

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (view === "study") {
    if (studyQueue.length === 0) {
      return (
        <div style={{ maxWidth: 580, margin: "0 auto" }}>
          <EmptyState
            title="All cards are marked as Known!"
            body="Reset card statuses or add new ones to study again."
            icon="✅"
            action={<Button onClick={() => setView("list")}>Back to list</Button>}
          />
        </div>
      );
    }
    return (
      <StudyMode
        cards={studyQueue}
        onReview={reviewCard}
        onExit={() => setView("list")}
      />
    );
  }

  if (view === "add") {
    return <CardForm onSave={addCard} onCancel={() => setView("list")} />;
  }

  if (view === "edit" && editing) {
    return (
      <CardForm
        initial={editing}
        onSave={editCard}
        onCancel={() => {
          setEditing(null);
          setView("list");
        }}
      />
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Stats */}
      <Card padding={18}>
        <StatGrid min={110}>
          <Stat label="Total" value={stats.total} />
          <Stat label="Known" value={stats.known} tone="success" />
          <Stat label="Learning" value={stats.learning} tone="warning" />
          <Stat label="New" value={stats.newCards} />
        </StatGrid>
      </Card>

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button
          onClick={() => setView("study")}
          disabled={cards.length === 0}
        >
          ▶ Study ({studyQueue.length} cards)
        </Button>
        <Button variant="secondary" onClick={() => setView("add")}>
          + Add card
        </Button>
      </div>

      {/* Filter tabs */}
      {cards.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {(["ALL", "NEW", "LEARNING", "KNOWN"] as const).map((f) => (
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
              {f === "ALL" ? `All (${cards.length})` : `${f} (${cards.filter((c) => c.status === f).length})`}
            </button>
          ))}
        </div>
      )}

      <Divider margin={0} />

      {/* Card list */}
      {filtered.length === 0 ? (
        <EmptyState
          title={cards.length === 0 ? "No flashcards yet" : "No cards match this filter"}
          body={
            cards.length === 0
              ? "Create flashcards to study key terms and concepts from your materials."
              : undefined
          }
          icon="🃏"
          action={
            cards.length === 0 ? (
              <Button onClick={() => setView("add")}>Add your first card</Button>
            ) : undefined
          }
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map((card) => (
            <CardRow
              key={card.id}
              card={card}
              onEdit={(c) => {
                setEditing(c);
                setView("edit");
              }}
              onDelete={deleteCard}
            />
          ))}
        </div>
      )}
    </div>
  );
}
