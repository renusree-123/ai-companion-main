"use client";

import { useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  SectionTitle,
  Divider,
  inputStyle,
} from "@/components/ui";
import { MasteryMeter } from "@/components/charts";
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

// Deterministic decorative color per project — purely visual grouping, never
// encodes data (same palette as Spaces).
const PROJECT_COLORS = ["indigo", "emerald", "amber", "rose", "sky", "violet"] as const;
function colorForProject(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[hash % PROJECT_COLORS.length];
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
    <Card padding={20} className="animate-pop" style={{ borderColor: "var(--accent)" }}>
      <SectionTitle hint="It's added to the project you pick below, and shows up here right away.">
        ✨ Add Flashcard
      </SectionTitle>
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

const FILTERS = [
  { key: "ALL", label: "All", icon: "🗂️" },
  { key: "NEW", label: "New", icon: "🆕" },
  { key: "LEARNING", label: "Learning", icon: "📚" },
  { key: "KNOWN", label: "Known", icon: "✅" },
] as const;

export function GlobalFlashcardsPanel({ projects, initialCards }: GlobalFlashcardsPanelProps) {
  const [cards, setCards] = useState<FlashcardItem[]>(initialCards);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState<"ALL" | "NEW" | "LEARNING" | "KNOWN">("ALL");
  const [query, setQuery] = useState("");

  const total = cards.length;
  const known = cards.filter((c) => c.status === "KNOWN").length;
  const learning = cards.filter((c) => c.status === "LEARNING").length;
  const newCount = cards.filter((c) => c.status === "NEW").length;
  const mastery = total > 0 ? known / total : 0;

  const reviewed = cards.filter((c) => c.reviewCount > 0);
  const accuracy =
    reviewed.length > 0
      ? Math.round(
          (reviewed.reduce((sum, c) => sum + c.correctCount, 0) /
            reviewed.reduce((sum, c) => sum + c.reviewCount, 0)) *
            100,
        )
      : null;

  // Group by project
  const byProject = useMemo(() => {
    const map = new Map<string, { projectId: string; projectName: string; cards: FlashcardItem[] }>();
    const q = query.trim().toLowerCase();
    const statusFiltered = filter === "ALL" ? cards : cards.filter((c) => c.status === filter);
    const searched = q
      ? statusFiltered.filter(
          (c) =>
            c.front.toLowerCase().includes(q) ||
            c.back.toLowerCase().includes(q) ||
            c.projectName.toLowerCase().includes(q),
        )
      : statusFiltered;
    for (const card of searched) {
      const key = card.projectId;
      if (!map.has(key)) {
        map.set(key, { projectId: card.projectId, projectName: card.projectName, cards: [] });
      }
      map.get(key)!.cards.push(card);
    }
    return map;
  }, [cards, filter, query]);

  const handleSaved = useCallback((card: FlashcardItem) => {
    setCards((prev) => [card, ...prev]);
    setShowForm(false);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

      {/* Hero header */}
      <Card
        padding={24}
        className="animate-in-down"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--surface)), var(--surface))",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            top: -60,
            right: -60,
            width: 200,
            height: 200,
            borderRadius: "50%",
            background: "radial-gradient(circle, color-mix(in srgb, var(--accent) 22%, transparent), transparent 70%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 16,
            position: "relative",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 46,
                height: 46,
                borderRadius: 12,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 22,
                flexShrink: 0,
                background: "linear-gradient(135deg, var(--accent), var(--accent-hover))",
                boxShadow: "0 4px 14px -3px color-mix(in srgb, var(--accent) 55%, transparent)",
              }}
            >
              🃏
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: "-0.025em" }}>
                Flashcards
              </h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)" }}>
                {total > 0
                  ? `${total} card${total === 1 ? "" : "s"} across ${byProjectCount(cards)} project${byProjectCount(cards) === 1 ? "" : "s"}${accuracy !== null ? ` · ${accuracy}% recall accuracy` : ""}`
                  : "All your cards across every project, in one place"}
              </p>
            </div>
          </div>
          {projects.length > 0 && (
            <Button onClick={() => setShowForm((v) => !v)} size="md">
              {showForm ? "✕ Cancel" : "+ Add Card"}
            </Button>
          )}
        </div>
      </Card>

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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: 14,
          }}
        >
          <StatTile icon="🗂️" label="Total cards" value={total} tone="default" />
          <StatTile icon="✅" label="Known" value={known} tone="success" sub={total > 0 ? `${Math.round((known / total) * 100)}% mastered` : undefined} />
          <StatTile icon="📚" label="Learning" value={learning} tone="warning" />
          <StatTile icon="🆕" label="New" value={newCount} tone="info" />
        </div>
      )}

      {/* Overall progress */}
      {total > 0 && (
        <Card padding={16}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text-muted)" }}>
              Overall mastery
            </span>
            <span style={{ fontSize: 12.5, fontWeight: 650 }}>{Math.round(mastery * 100)}%</span>
          </div>
          <MasteryMeter level={mastery} showValue={false} />
        </Card>
      )}

      {/* Toolbar: search + filter tabs */}
      {total > 0 && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 220px", minWidth: 180 }}>
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 11,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: 13,
                color: "var(--text-subtle)",
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search cards or projects…"
              style={{ ...inputStyle, paddingLeft: 30 }}
            />
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map(({ key: f, label, icon }) => {
              const count = f === "ALL" ? total
                : f === "NEW" ? newCount
                : f === "LEARNING" ? learning
                : known;
              const active = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "5px 12px",
                    borderRadius: 999,
                    fontSize: 12.5,
                    fontWeight: 560,
                    border: "1px solid",
                    borderColor: active ? "var(--accent)" : "var(--border)",
                    background: active ? "var(--accent-soft)" : "transparent",
                    color: active ? "var(--accent)" : "var(--text-muted)",
                    cursor: "pointer",
                    transition: "all 140ms ease",
                  }}
                >
                  <span aria-hidden="true">{icon}</span>
                  {label} <span style={{ opacity: 0.75 }}>({count})</span>
                </button>
              );
            })}
          </div>
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
          <EmptyState
            icon="🔍"
            title={query ? `No cards match "${query}"` : `No ${filter.toLowerCase()} cards`}
            body={query ? "Try a different search term or clear the filter." : undefined}
            action={
              query || filter !== "ALL" ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setQuery("");
                    setFilter("ALL");
                  }}
                >
                  Clear search & filters
                </Button>
              ) : undefined
            }
          />
        </Card>
      )}

      {/* Cards grouped by project */}
      {byProject.size > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
            gap: 16,
          }}
        >
          {[...byProject.values()].map(({ projectId, projectName, cards: projectCards }, i) => {
            const toStudy = projectCards.filter((c) => c.status !== "KNOWN").length;
            const knownCount = projectCards.filter((c) => c.status === "KNOWN").length;
            const projectMastery = projectCards.length > 0 ? knownCount / projectCards.length : 0;
            const color = colorForProject(projectId);
            return (
              <Card
                key={projectId}
                padding={0}
                className="animate-in"
                style={{ overflow: "hidden", animationDelay: `${Math.min(i, 8) * 45}ms`, display: "flex", flexDirection: "column" }}
              >
                <div style={{ height: 4, background: `var(--space-${color})`, flexShrink: 0 }} />
                <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div
                        aria-hidden="true"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 9,
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 13.5,
                          fontWeight: 700,
                          color: "#fff",
                          background: `var(--space-${color})`,
                        }}
                      >
                        {projectName.trim().charAt(0).toUpperCase() || "?"}
                      </div>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: 14.5,
                          fontWeight: 650,
                          letterSpacing: "-0.01em",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={projectName}
                      >
                        {projectName}
                      </h2>
                    </div>
                    <Button href={`/projects/${projectId}/flashcards`} variant="secondary" size="sm" style={{ flexShrink: 0 }}>
                      {toStudy > 0 ? `Study (${toStudy})` : "Open"}
                    </Button>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 550 }}>Mastery</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 650 }}>
                        {Math.round(projectMastery * 100)}%
                      </span>
                    </div>
                    <MasteryMeter level={projectMastery} showValue={false} height={6} />
                  </div>

                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge tone="default">{projectCards.length} card{projectCards.length === 1 ? "" : "s"}</Badge>
                    {knownCount > 0 && <Badge tone="success">{knownCount} known</Badge>}
                    {toStudy > 0 && <Badge tone="warning">{toStudy} to study</Badge>}
                  </div>

                  <Divider margin={2} />

                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {projectCards.slice(0, 4).map((card) => (
                      <div
                        key={card.id}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: 2,
                          padding: "8px 10px",
                          background: "var(--surface-2, var(--surface))",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          transition: "border-color 140ms ease, transform 140ms ease",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <Badge
                            tone={
                              card.status === "KNOWN" ? "success"
                              : card.status === "LEARNING" ? "warning"
                              : "default"
                            }
                          >
                            {card.status}
                          </Badge>
                          <span
                            style={{
                              flex: 1,
                              fontSize: 12.5,
                              fontWeight: 560,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {card.front}
                          </span>
                        </div>
                        <span
                          style={{
                            fontSize: 11.5,
                            color: "var(--text-muted)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            paddingLeft: 2,
                          }}
                        >
                          {card.back}
                        </span>
                      </div>
                    ))}
                    {projectCards.length > 4 && (
                      <Link
                        href={`/projects/${projectId}/flashcards`}
                        style={{
                          fontSize: 12.5,
                          fontWeight: 550,
                          color: "var(--accent)",
                          padding: "4px 2px",
                        }}
                      >
                        +{projectCards.length - 4} more →
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function byProjectCount(cards: FlashcardItem[]): number {
  return new Set(cards.map((c) => c.projectId)).size;
}

function StatTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  sub?: string;
  tone: "default" | "success" | "warning" | "info";
}) {
  const toneColor =
    tone === "success" ? "var(--success)"
    : tone === "warning" ? "var(--warning)"
    : tone === "info" ? "var(--info)"
    : "var(--accent)";
  const toneSoft =
    tone === "success" ? "var(--success-soft)"
    : tone === "warning" ? "var(--warning-soft)"
    : tone === "info" ? "var(--info-soft)"
    : "var(--accent-soft)";

  return (
    <Card padding={16} style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        aria-hidden="true"
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 17,
          background: toneSoft,
        }}
      >
        {icon}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 20, fontWeight: 680, lineHeight: 1.1, color: toneColor, fontVariantNumeric: "tabular-nums" }}>
          {value}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--text-muted)", fontWeight: 550, marginTop: 2 }}>
          {label}
        </div>
        {sub && (
          <div style={{ fontSize: 10.5, color: "var(--text-subtle)", marginTop: 1 }}>{sub}</div>
        )}
      </div>
    </Card>
  );
}
