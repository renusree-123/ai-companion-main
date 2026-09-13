"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Badge,
  Button,
  Card,
  Field,
  SectionTitle,
  formatPercent,
  inputStyle,
} from "./ui";
import { DifficultyBadge } from "./learning";
import { ChartTheme, Donut } from "./charts";
import { renderMarkdown } from "@/lib/markdown";

/**
 * AI Learning Hub (PRD §92 — additional AI-powered experiences).
 *
 * Three topic-first tools that work without a Project or an uploaded document:
 * a quiz generator, a summariser and a topic explainer. They are deliberately
 * separate from the project experiences: nothing here is grounded in the
 * learner's own materials, so every result is labelled as general knowledge and
 * none of it feeds mastery, growth or analytics.
 */

type Tool = "quiz" | "summary" | "explain";

const TOOLS: { id: Tool; label: string; icon: string; blurb: string }[] = [
  {
    id: "quiz",
    label: "Quiz Generator",
    icon: "✅",
    blurb: "Turn any topic into a scored multiple-choice quiz with explanations.",
  },
  {
    id: "summary",
    label: "Summarizer",
    icon: "📄",
    blurb: "Paste content — or name a topic — and get a clear summary.",
  },
  {
    id: "explain",
    label: "Topic Explainer",
    icon: "💡",
    blurb: "Get any idea explained simply, with examples and next steps.",
  },
];

// ---------------------------------------------------------------------------
// Result shapes returned by /api/learning-hub/*
// ---------------------------------------------------------------------------

interface HubQuestion {
  index: number;
  question: string;
  options: string[];
  concept: string;
  difficulty: string;
}

interface GeneratedQuiz {
  artifactId: string;
  topic: string;
  overview: string;
  questions: HubQuestion[];
}

interface GradedQuestion extends HubQuestion {
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
}

interface QuizScore {
  topic: string;
  score: number;
  correctCount: number;
  questionCount: number;
  questions: GradedQuestion[];
}

interface SummaryResult {
  title: string;
  summary: string;
  keyPoints: string[];
  keyTerms: { term: string; meaning: string }[];
  takeaway: string;
  caveats: string;
}

interface ExplanationResult {
  topic: string;
  oneLiner: string;
  explanation: string;
  analogy: string;
  keyPoints: string[];
  examples: { title: string; detail: string }[];
  commonMistakes: string[];
  nextSteps: string[];
  caveats: string;
}

/**
 * Reads the app's standard error envelope.
 *
 * In development it prefers `devMessage` — the internal reason — over the
 * gentler user-facing text, and appends the error code and trace id. "Could not
 * complete that" is the right thing to show a learner and the wrong thing to
 * show the person debugging it, and in dev those are the same person.
 */
async function readError(response: Response, fallback: string): Promise<string> {
  const isDev = process.env.NODE_ENV !== "production";
  try {
    const body = await response.json();
    const error = body?.error;
    const message = (isDev ? error?.devMessage : null) ?? error?.message ?? fallback;
    if (!isDev) return message;

    const parts = [message];
    if (error?.code) parts.push(`[${error.code}]`);
    if (body?.traceId) parts.push(`(trace ${body.traceId})`);
    return parts.join(" ");
  } catch {
    // A non-JSON body means the server did not reach our error envelope at all
    // — a crash, a proxy, or an HTML error page. The status is the only signal.
    return isDev ? `${fallback} (HTTP ${response.status} ${response.statusText})` : fallback;
  }
}

export function LearningHub({ isLiveProvider }: { isLiveProvider: boolean }) {
  const [tool, setTool] = useState<Tool>("quiz");

  return (
    <ChartTheme>
      <div
        role="tablist"
        aria-label="Learning Hub tools"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 12,
          marginBottom: 18,
        }}
      >
        {TOOLS.map((entry) => {
          const active = entry.id === tool;
          return (
            <button
              key={entry.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTool(entry.id)}
              style={{
                textAlign: "left",
                cursor: "pointer",
                background: active ? "var(--accent-soft)" : "var(--surface)",
                border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
                borderRadius: "var(--radius)",
                padding: 14,
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span aria-hidden="true" style={{ fontSize: 15 }}>
                  {entry.icon}
                </span>
                <span
                  style={{
                    fontSize: 13.5,
                    fontWeight: 630,
                    color: active ? "var(--accent)" : "var(--text)",
                  }}
                >
                  {entry.label}
                </span>
              </div>
              <p
                style={{
                  margin: "6px 0 0",
                  fontSize: 12,
                  lineHeight: 1.55,
                  color: "var(--text-muted)",
                }}
              >
                {entry.blurb}
              </p>
            </button>
          );
        })}
      </div>

      {!isLiveProvider ? (
        <div style={{ marginBottom: 16 }}>
          <Alert tone="warning" title="Offline provider">
            No AI model key is configured, so the Hub can only work from text you paste in. Add a
            paragraph or more of source content below, or set <code>GROQ_API_KEY</code> to
            generate from a topic alone.
          </Alert>
        </div>
      ) : null}

      {tool === "quiz" ? <QuizTool /> : null}
      {tool === "summary" ? <SummaryTool /> : null}
      {tool === "explain" ? <ExplainTool /> : null}
    </ChartTheme>
  );
}

// ---------------------------------------------------------------------------
// Shared form pieces
// ---------------------------------------------------------------------------

function SourceField({
  value,
  onChange,
  hint,
}: {
  value: string;
  onChange: (value: string) => void;
  hint: string;
}) {
  return (
    <Field label="Source content (optional)" hint={hint}>
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={6}
        maxLength={20000}
        placeholder="Paste notes, an article, a transcript…"
        style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit", lineHeight: 1.6 }}
      />
    </Field>
  );
}

function selectStyle() {
  return { ...inputStyle, cursor: "pointer" };
}

function LoadingNote({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        fontSize: 12.5,
        color: "var(--text-muted)",
        marginTop: 12,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 9,
          height: 9,
          borderRadius: 999,
          background: "var(--accent)",
          opacity: 0.8,
        }}
      />
      {children}
    </div>
  );
}

function GeneralKnowledgeNote({ caveats }: { caveats?: string }) {
  return (
    <p
      style={{
        margin: "14px 0 0",
        fontSize: 11.5,
        lineHeight: 1.6,
        color: "var(--text-subtle)",
      }}
    >
      Generated from general AI knowledge, not from your uploaded materials — check anything you
      intend to rely on. For answers grounded in your own documents with page citations, use the AI
      Tutor inside a Project.
      {caveats ? ` ${caveats}` : ""}
    </p>
  );
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 6 }}>
      {items.map((item, index) => (
        <li key={index} style={{ fontSize: 13, lineHeight: 1.62 }}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function Prose({ markdown }: { markdown: string }) {
  return (
    <div
      className="prose"
      style={{ fontSize: 13.5, lineHeight: 1.68 }}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
    />
  );
}

// ---------------------------------------------------------------------------
// 1. Quiz generator
// ---------------------------------------------------------------------------

function QuizTool() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [questionCount, setQuestionCount] = useState(5);
  const [difficulty, setDifficulty] = useState("MIXED");

  const [loading, setLoading] = useState(false);
  const [grading, setGrading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<GeneratedQuiz | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [result, setResult] = useState<QuizScore | null>(null);

  async function generate() {
    if (topic.trim().length < 2) {
      setError("Enter a topic to build a quiz from.");
      return;
    }
    setLoading(true);
    setError(null);
    setQuiz(null);
    setResult(null);
    setAnswers({});

    try {
      const response = await fetch("/api/learning-hub/quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, questionCount, difficulty, sourceContent }),
      });
      if (!response.ok) {
        setError(await readError(response, "The quiz could not be generated."));
        return;
      }
      const body = await response.json();
      setQuiz(body.data);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!quiz) return;
    setGrading(true);
    setError(null);
    try {
      const response = await fetch(`/api/learning-hub/quiz/${quiz.artifactId}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: quiz.questions.map((question) => ({
            index: question.index,
            selectedIndex: answers[question.index] ?? null,
          })),
        }),
      });
      if (!response.ok) {
        setError(await readError(response, "The quiz could not be scored."));
        return;
      }
      const body = await response.json();
      setResult(body.data);
      router.refresh();
    } catch {
      setError("Could not reach the server. Your answers were not scored.");
    } finally {
      setGrading(false);
    }
  }

  function reset() {
    setQuiz(null);
    setResult(null);
    setAnswers({});
    setError(null);
  }

  const answeredCount = quiz
    ? quiz.questions.filter((question) => answers[question.index] !== undefined).length
    : 0;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <SectionTitle hint="Any topic. The answer key stays on the server until you submit.">
          Generate a quiz
        </SectionTitle>

        <Field label="Topic" required>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Photosynthesis, React hooks, the Treaty of Versailles"
            maxLength={160}
            style={inputStyle}
            disabled={loading}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Questions">
            <select
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
              style={selectStyle()}
              disabled={loading}
            >
              {[3, 5, 8, 10, 15].map((count) => (
                <option key={count} value={count}>
                  {count} questions
                </option>
              ))}
            </select>
          </Field>
          <Field label="Difficulty">
            <select
              value={difficulty}
              onChange={(event) => setDifficulty(event.target.value)}
              style={selectStyle()}
              disabled={loading}
            >
              <option value="MIXED">Mixed</option>
              <option value="EASY">Easy</option>
              <option value="MEDIUM">Medium</option>
              <option value="HARD">Hard</option>
            </select>
          </Field>
        </div>

        <SourceField
          value={sourceContent}
          onChange={setSourceContent}
          hint="Paste text to quiz yourself on exactly that material instead of general knowledge."
        />

        <Button onClick={generate} disabled={loading}>
          {loading ? "Generating…" : quiz ? "Generate a new quiz" : "Generate quiz"}
        </Button>

        {loading ? <LoadingNote>Writing questions and distractors…</LoadingNote> : null}
        {error ? (
          <div style={{ marginTop: 12 }}>
            <Alert tone="danger" title="Could not complete that">
              <span style={{ wordBreak: "break-word" }}>{error}</span>
            </Alert>
          </div>
        ) : null}
      </Card>

      {quiz && !result ? (
        <Card>
          <SectionTitle
            hint={`${answeredCount} of ${quiz.questions.length} answered`}
            action={
              <Button variant="ghost" size="sm" onClick={reset}>
                Discard
              </Button>
            }
          >
            {quiz.topic}
          </SectionTitle>

          {quiz.overview ? (
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--text-muted)", lineHeight: 1.6 }}>
              {quiz.overview}
            </p>
          ) : null}

          <div style={{ display: "grid", gap: 18 }}>
            {quiz.questions.map((question) => (
              <fieldset key={question.index} style={{ border: 0, margin: 0, padding: 0 }}>
                <legend style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.55, marginBottom: 8 }}>
                  {question.index + 1}. {question.question}
                </legend>
                <div style={{ display: "flex", gap: 6, marginBottom: 9, flexWrap: "wrap" }}>
                  <DifficultyBadge difficulty={question.difficulty} />
                  {question.concept ? <Badge>{question.concept}</Badge> : null}
                </div>
                <div style={{ display: "grid", gap: 6 }}>
                  {question.options.map((option, optionIndex) => {
                    const selected = answers[question.index] === optionIndex;
                    return (
                      <label
                        key={optionIndex}
                        style={{
                          display: "flex",
                          gap: 9,
                          alignItems: "flex-start",
                          padding: "9px 11px",
                          borderRadius: 8,
                          cursor: "pointer",
                          fontSize: 13,
                          lineHeight: 1.55,
                          background: selected ? "var(--accent-soft)" : "var(--surface-2)",
                          border: `1px solid ${selected ? "var(--accent)" : "transparent"}`,
                        }}
                      >
                        <input
                          type="radio"
                          name={`hub-question-${question.index}`}
                          checked={selected}
                          onChange={() =>
                            setAnswers((current) => ({ ...current, [question.index]: optionIndex }))
                          }
                          style={{ marginTop: 3 }}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>

          <div style={{ marginTop: 18, display: "flex", gap: 10, alignItems: "center" }}>
            <Button onClick={submit} disabled={grading || answeredCount === 0}>
              {grading ? "Scoring…" : "Submit answers"}
            </Button>
            {answeredCount < quiz.questions.length ? (
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Unanswered questions are marked wrong.
              </span>
            ) : null}
          </div>

          <GeneralKnowledgeNote />
        </Card>
      ) : null}

      {result ? <QuizResults result={result} onRetake={reset} /> : null}
    </div>
  );
}

function QuizResults({ result, onRetake }: { result: QuizScore; onRetake: () => void }) {
  const tone = result.score >= 0.8 ? "success" : result.score >= 0.5 ? "warning" : "danger";

  return (
    <Card>
      <SectionTitle
        action={
          <Button variant="secondary" size="sm" onClick={onRetake}>
            New quiz
          </Button>
        }
      >
        Results — {result.topic}
      </SectionTitle>

      <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <Donut value={result.score} label={formatPercent(result.score)} />
        <div>
          <div style={{ fontSize: 15, fontWeight: 620 }}>
            {result.correctCount} of {result.questionCount} correct
          </div>
          <p style={{ margin: "5px 0 0", fontSize: 12.5, color: "var(--text-muted)", maxWidth: 420, lineHeight: 1.6 }}>
            {result.score >= 0.8
              ? "Strong — you have this topic. Read the explanations for anything you guessed."
              : result.score >= 0.5
                ? "A working grasp with gaps. The explanations below name what to revisit."
                : "Worth another pass. Each explanation says why the right answer is right."}
          </p>
        </div>
      </div>

      <div style={{ display: "grid", gap: 14, marginTop: 20 }}>
        {result.questions.map((question) => (
          <div
            key={question.index}
            style={{
              borderLeft: `3px solid ${question.isCorrect ? "var(--success)" : "var(--danger)"}`,
              paddingLeft: 12,
            }}
          >
            <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.5 }}>
                {question.index + 1}. {question.question}
              </span>
              <Badge tone={question.isCorrect ? "success" : "danger"}>
                {question.isCorrect ? "Correct" : "Incorrect"}
              </Badge>
            </div>

            <div style={{ display: "grid", gap: 4, marginTop: 8 }}>
              {question.options.map((option, optionIndex) => {
                const isAnswer = optionIndex === question.correctIndex;
                const isChosen = optionIndex === question.selectedIndex;
                return (
                  <div
                    key={optionIndex}
                    style={{
                      fontSize: 12.5,
                      lineHeight: 1.55,
                      padding: "6px 10px",
                      borderRadius: 7,
                      background: isAnswer
                        ? "var(--success-soft)"
                        : isChosen
                          ? "var(--danger-soft)"
                          : "transparent",
                      color: isAnswer
                        ? "var(--success)"
                        : isChosen
                          ? "var(--danger)"
                          : "var(--text-muted)",
                    }}
                  >
                    {isAnswer ? "✓ " : isChosen ? "✕ " : ""}
                    {option}
                  </div>
                );
              })}
              {question.selectedIndex === null ? (
                <div style={{ fontSize: 12, color: "var(--text-subtle)" }}>You left this blank.</div>
              ) : null}
            </div>

            <p style={{ margin: "9px 0 0", fontSize: 12.8, lineHeight: 1.62, color: "var(--text-muted)" }}>
              {question.explanation}
            </p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>
        <Alert tone={tone === "success" ? "success" : "info"}>
          This quiz is a standalone practice tool — it does not change the mastery or growth
          tracking inside your Projects, which are built only from your own materials.
        </Alert>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Summarizer
// ---------------------------------------------------------------------------

function SummaryTool() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [style, setStyle] = useState("STANDARD");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SummaryResult | null>(null);

  async function generate() {
    if (topic.trim().length < 2) {
      setError("Give the summary a topic or title.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/learning-hub/summary", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, sourceContent, style }),
      });
      if (!response.ok) {
        setError(await readError(response, "The summary could not be generated."));
        return;
      }
      const body = await response.json();
      setResult(body.data);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <SectionTitle hint="Paste content to summarise it faithfully, or name a topic on its own.">
          Summarise
        </SectionTitle>

        <Field label="Topic or title" required>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Chapter 3 — cell respiration"
            maxLength={160}
            style={inputStyle}
            disabled={loading}
          />
        </Field>

        <Field label="Length">
          <select
            value={style}
            onChange={(event) => setStyle(event.target.value)}
            style={selectStyle()}
            disabled={loading}
          >
            <option value="BRIEF">Brief — one paragraph</option>
            <option value="STANDARD">Standard — a few paragraphs</option>
            <option value="DETAILED">Detailed — with the reasoning</option>
          </select>
        </Field>

        <SourceField
          value={sourceContent}
          onChange={setSourceContent}
          hint="When supplied, the summary sticks to this text and nothing else."
        />

        <Button onClick={generate} disabled={loading}>
          {loading ? "Summarising…" : "Summarise"}
        </Button>

        {loading ? <LoadingNote>Reading and condensing…</LoadingNote> : null}
        {error ? (
          <div style={{ marginTop: 12 }}>
            <Alert tone="danger" title="Could not complete that">
              <span style={{ wordBreak: "break-word" }}>{error}</span>
            </Alert>
          </div>
        ) : null}
      </Card>

      {result ? (
        <Card>
          <SectionTitle>{result.title}</SectionTitle>
          <Prose markdown={result.summary} />

          {result.keyPoints.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <SectionTitle>Key points</SectionTitle>
              <Bullets items={result.keyPoints} />
            </div>
          ) : null}

          {result.keyTerms.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <SectionTitle>Key terms</SectionTitle>
              <dl style={{ margin: 0, display: "grid", gap: 9 }}>
                {result.keyTerms.map((term) => (
                  <div key={term.term}>
                    <dt style={{ fontSize: 13, fontWeight: 620 }}>{term.term}</dt>
                    <dd style={{ margin: "2px 0 0", fontSize: 12.8, lineHeight: 1.6, color: "var(--text-muted)" }}>
                      {term.meaning}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}

          {result.takeaway ? (
            <div style={{ marginTop: 18 }}>
              <Alert tone="accent" title="Takeaway">
                {result.takeaway}
              </Alert>
            </div>
          ) : null}

          <GeneralKnowledgeNote caveats={result.caveats} />
        </Card>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. Topic explainer
// ---------------------------------------------------------------------------

function ExplainTool() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [level, setLevel] = useState("BEGINNER");
  const [sourceContent, setSourceContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ExplanationResult | null>(null);

  async function generate() {
    if (topic.trim().length < 2) {
      setError("Enter a topic to explain.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const response = await fetch("/api/learning-hub/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ topic, level, sourceContent }),
      });
      if (!response.ok) {
        setError(await readError(response, "The explanation could not be generated."));
        return;
      }
      const body = await response.json();
      setResult(body.data);
      router.refresh();
    } catch {
      setError("Could not reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <Card>
        <SectionTitle hint="Explained from first principles, with examples and what to learn next.">
          Explain a topic
        </SectionTitle>

        <Field label="Topic" required>
          <input
            value={topic}
            onChange={(event) => setTopic(event.target.value)}
            placeholder="e.g. Why does compound interest grow so fast?"
            maxLength={160}
            style={inputStyle}
            disabled={loading}
          />
        </Field>

        <Field label="Level">
          <select
            value={level}
            onChange={(event) => setLevel(event.target.value)}
            style={selectStyle()}
            disabled={loading}
          >
            <option value="BEGINNER">Beginner — assume nothing</option>
            <option value="INTERMEDIATE">Intermediate — I know the basics</option>
            <option value="ADVANCED">Advanced — mechanism and trade-offs</option>
          </select>
        </Field>

        <SourceField
          value={sourceContent}
          onChange={setSourceContent}
          hint="Optional. Paste the passage you are stuck on and the explanation will stay with it."
        />

        <Button onClick={generate} disabled={loading}>
          {loading ? "Explaining…" : "Explain this"}
        </Button>

        {loading ? <LoadingNote>Working through the idea…</LoadingNote> : null}
        {error ? (
          <div style={{ marginTop: 12 }}>
            <Alert tone="danger" title="Could not complete that">
              <span style={{ wordBreak: "break-word" }}>{error}</span>
            </Alert>
          </div>
        ) : null}
      </Card>

      {result ? (
        <Card>
          <SectionTitle hint={result.oneLiner}>{result.topic}</SectionTitle>
          <Prose markdown={result.explanation} />

          {result.analogy ? (
            <div style={{ marginTop: 18 }}>
              <SectionTitle>An analogy</SectionTitle>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.65 }}>{result.analogy}</p>
            </div>
          ) : null}

          {result.keyPoints.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <SectionTitle>Key points</SectionTitle>
              <Bullets items={result.keyPoints} />
            </div>
          ) : null}

          {result.examples.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <SectionTitle>Examples</SectionTitle>
              <div style={{ display: "grid", gap: 10 }}>
                {result.examples.map((example) => (
                  <div
                    key={example.title}
                    style={{
                      background: "var(--surface-2)",
                      borderRadius: 8,
                      padding: "11px 13px",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 620, marginBottom: 3 }}>
                      {example.title}
                    </div>
                    <div style={{ fontSize: 12.8, lineHeight: 1.62, color: "var(--text-muted)" }}>
                      {example.detail}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {result.commonMistakes.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <SectionTitle>Common mistakes</SectionTitle>
              <Bullets items={result.commonMistakes} />
            </div>
          ) : null}

          {result.nextSteps.length > 0 ? (
            <div style={{ marginTop: 18 }}>
              <SectionTitle>What to do next</SectionTitle>
              <Bullets items={result.nextSteps} />
            </div>
          ) : null}

          <GeneralKnowledgeNote caveats={result.caveats} />
        </Card>
      ) : null}
    </div>
  );
}
