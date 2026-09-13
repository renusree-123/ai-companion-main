import { db } from "../db";
import { AppError, notFound } from "../errors";
import { newTraceId } from "../logger";
import { parseJson } from "../json";
import { recordActivity } from "../activity";
import { ai } from "../ai/router";
import { runStructuredPrompt } from "../ai/run";
import {
  hubExplainPrompt,
  hubQuizPrompt,
  hubSummaryPrompt,
  type HubExplanation,
  type HubQuiz,
  type HubSummary,
} from "../ai/prompts";

/**
 * AI Learning Hub (quiz generator, summariser, topic explainer).
 *
 * A deliberately *standalone* surface: the learner names a topic, or pastes
 * text, and gets a result. It shares the product's AI plumbing — the prompt
 * registry, the router with its retries, fallback, usage logging and spend cap,
 * and the structured-output validation — but touches none of the Space,
 * Project, mastery, growth or analytics state. Hub output is never grounded in
 * the learner's uploaded materials, so letting it move a mastery estimate would
 * corrupt the evidence those estimates are built from.
 *
 * What it does share with the rest of the product:
 *   - ownership: every artefact is scoped to the user who created it
 *   - activity: Hub actions appear in the learner's timeline and admin views
 *   - observability: every generation is attributed to a prompt id + version
 *     and a trace id, so it shows up in the admin AI dashboards like any other
 *     AI feature
 */

export const HUB_KINDS = ["QUIZ", "SUMMARY", "EXPLANATION"] as const;
export type HubKind = (typeof HUB_KINDS)[number];

/** Source text longer than this is truncated before it reaches the model. */
export const HUB_MAX_SOURCE_CHARS = 20_000;
/** Below this, the offline provider has nothing to extract from. */
const OFFLINE_MIN_SOURCE_CHARS = 200;

export interface HubQuestionForLearner {
  index: number;
  question: string;
  options: string[];
  concept: string;
  difficulty: string;
}

export interface HubQuizResult {
  artifactId: string;
  topic: string;
  overview: string;
  questions: HubQuestionForLearner[];
}

export interface HubGradedQuestion extends HubQuestionForLearner {
  selectedIndex: number | null;
  correctIndex: number;
  isCorrect: boolean;
  explanation: string;
}

export interface HubQuizScore {
  artifactId: string;
  topic: string;
  score: number;
  correctCount: number;
  questionCount: number;
  questions: HubGradedQuestion[];
}

export interface HubArtifactSummary {
  id: string;
  kind: string;
  topic: string;
  createdAt: Date;
  questionCount: number;
  correctCount: number;
  score: number;
  completedAt: Date | null;
}

/**
 * The Hub answers from general model knowledge, which the offline provider does
 * not have. Rather than let it invent a topic it knows nothing about, a
 * topic-only request is refused while offline with an explanation of the two
 * ways forward.
 */
function assertUsableInput(sourceContent: string, what: string): void {
  if (ai.describe().isLive) return;
  if (sourceContent.trim().length >= OFFLINE_MIN_SOURCE_CHARS) return;
  throw new AppError("CONFLICT", `Offline provider cannot ${what} from a topic alone.`, {
    userMessage:
      "No AI provider key is configured, so the Learning Hub can only work from text you " +
      "supply. Paste at least a paragraph of source content below, or set GROQ_API_KEY " +
      "to generate from a topic alone.",
  });
}

function trimSource(sourceContent: string): string {
  return sourceContent.trim().slice(0, HUB_MAX_SOURCE_CHARS);
}

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export async function generateHubQuiz(input: {
  userId: string;
  topic: string;
  questionCount: number;
  difficulty: "EASY" | "MEDIUM" | "HARD" | "MIXED";
  sourceContent: string;
}): Promise<HubQuizResult> {
  const sourceContent = trimSource(input.sourceContent);
  assertUsableInput(sourceContent, "generate a quiz");

  const traceId = newTraceId();
  const generated = await runStructuredPrompt(
    hubQuizPrompt,
    {
      topic: input.topic,
      questionCount: input.questionCount,
      difficulty: input.difficulty,
      sourceContent,
    },
    { traceId, userId: input.userId },
  );

  // Structured output is validated by the schema, but the schema cannot know
  // that correctIndex must point at an option that exists. Anything that fails
  // that check is dropped rather than shown to the learner with a broken key.
  const questions = generated.value.questions.filter(
    (question) =>
      question.options.length === 4 &&
      question.correctIndex >= 0 &&
      question.correctIndex < question.options.length,
  );

  if (questions.length === 0) {
    throw new AppError("AI_INVALID_OUTPUT", "Quiz generation returned no usable questions.", {
      userMessage:
        "The quiz could not be generated reliably this time. Try again, or narrow the topic.",
    });
  }

  const artifact = await db.hubArtifact.create({
    data: {
      userId: input.userId,
      kind: "QUIZ",
      topic: input.topic,
      input: sourceContent,
      // The answer key is stored server-side and withheld from the response
      // until the learner submits, so a reader of the network tab cannot lift
      // the answers out of the page.
      payload: JSON.stringify({ overview: generated.value.overview, questions }),
      questionCount: questions.length,
      promptId: hubQuizPrompt.id,
      promptVersion: hubQuizPrompt.version,
      traceId,
    },
  });

  await recordActivity({
    userId: input.userId,
    type: "HUB_QUIZ_GENERATED",
    summary: `Generated a ${questions.length}-question quiz on "${input.topic}"`,
    payload: { artifactId: artifact.id, topic: input.topic },
  });

  return {
    artifactId: artifact.id,
    topic: generated.value.topic || input.topic,
    overview: generated.value.overview,
    questions: questions.map((question, index) => ({
      index,
      question: question.question,
      options: question.options,
      concept: question.concept,
      difficulty: question.difficulty,
    })),
  };
}

/**
 * Grades a submitted Hub quiz.
 *
 * Grading is server-side against the stored key — the client sends only which
 * option it picked. Re-submitting overwrites the same row rather than creating
 * another, so a retried request (or a genuine retake) cannot produce duplicate
 * results or double-count anything.
 */
export async function submitHubQuiz(input: {
  userId: string;
  artifactId: string;
  answers: { index: number; selectedIndex: number | null }[];
}): Promise<HubQuizScore> {
  const artifact = await db.hubArtifact.findFirst({
    // Ownership is part of the lookup: another user's id is indistinguishable
    // from one that does not exist.
    where: { id: input.artifactId, userId: input.userId, kind: "QUIZ" },
  });
  if (!artifact) throw notFound("Quiz");

  const stored = parseJson<{ overview: string; questions: HubQuiz["questions"] }>(
    artifact.payload,
    { overview: "", questions: [] },
  );
  if (stored.questions.length === 0) throw notFound("Quiz");

  const selectionByIndex = new Map(
    input.answers.map((answer) => [answer.index, answer.selectedIndex]),
  );

  const questions: HubGradedQuestion[] = stored.questions.map((question, index) => {
    const selectedIndex = selectionByIndex.get(index) ?? null;
    return {
      index,
      question: question.question,
      options: question.options,
      concept: question.concept,
      difficulty: question.difficulty,
      selectedIndex,
      correctIndex: question.correctIndex,
      // An unanswered question is wrong, not skipped: the score has to mean
      // "how much of this did you know".
      isCorrect: selectedIndex === question.correctIndex,
      explanation: question.explanation,
    };
  });

  const correctCount = questions.filter((question) => question.isCorrect).length;
  const score = questions.length > 0 ? correctCount / questions.length : 0;
  const firstCompletion = artifact.completedAt === null;

  await db.hubArtifact.update({
    where: { id: artifact.id },
    data: {
      questionCount: questions.length,
      correctCount,
      score,
      completedAt: new Date(),
      payload: JSON.stringify({
        ...stored,
        lastAttempt: questions.map((question) => ({
          index: question.index,
          selectedIndex: question.selectedIndex,
          isCorrect: question.isCorrect,
        })),
      }),
    },
  });

  if (firstCompletion) {
    await recordActivity({
      userId: input.userId,
      type: "HUB_QUIZ_COMPLETED",
      summary: `Scored ${correctCount}/${questions.length} on "${artifact.topic}"`,
      payload: { artifactId: artifact.id, score },
    });
  }

  return {
    artifactId: artifact.id,
    topic: artifact.topic,
    score,
    correctCount,
    questionCount: questions.length,
    questions,
  };
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

export async function generateHubSummary(input: {
  userId: string;
  topic: string;
  sourceContent: string;
  style: "BRIEF" | "STANDARD" | "DETAILED";
}): Promise<HubSummary & { artifactId: string }> {
  const sourceContent = trimSource(input.sourceContent);
  assertUsableInput(sourceContent, "summarise");

  const traceId = newTraceId();
  const generated = await runStructuredPrompt(
    hubSummaryPrompt,
    { topic: input.topic, sourceContent, style: input.style },
    { traceId, userId: input.userId },
  );

  const artifact = await db.hubArtifact.create({
    data: {
      userId: input.userId,
      kind: "SUMMARY",
      topic: input.topic,
      input: sourceContent,
      payload: JSON.stringify(generated.value),
      promptId: hubSummaryPrompt.id,
      promptVersion: hubSummaryPrompt.version,
      traceId,
    },
  });

  await recordActivity({
    userId: input.userId,
    type: "HUB_SUMMARY_GENERATED",
    summary: `Summarised "${input.topic}"`,
    payload: { artifactId: artifact.id },
  });

  return { ...generated.value, artifactId: artifact.id };
}

// ---------------------------------------------------------------------------
// Explanation
// ---------------------------------------------------------------------------

export async function generateHubExplanation(input: {
  userId: string;
  topic: string;
  level: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  sourceContent: string;
}): Promise<HubExplanation & { artifactId: string }> {
  const sourceContent = trimSource(input.sourceContent);
  assertUsableInput(sourceContent, "explain a topic");

  const traceId = newTraceId();
  const generated = await runStructuredPrompt(
    hubExplainPrompt,
    { topic: input.topic, level: input.level, sourceContent },
    { traceId, userId: input.userId },
  );

  const artifact = await db.hubArtifact.create({
    data: {
      userId: input.userId,
      kind: "EXPLANATION",
      topic: input.topic,
      input: sourceContent,
      payload: JSON.stringify(generated.value),
      promptId: hubExplainPrompt.id,
      promptVersion: hubExplainPrompt.version,
      traceId,
    },
  });

  await recordActivity({
    userId: input.userId,
    type: "HUB_EXPLANATION_GENERATED",
    summary: `Explained "${input.topic}"`,
    payload: { artifactId: artifact.id },
  });

  return { ...generated.value, artifactId: artifact.id };
}

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

export async function listHubArtifacts(
  userId: string,
  options: { kind?: HubKind; limit?: number } = {},
): Promise<HubArtifactSummary[]> {
  const rows = await db.hubArtifact.findMany({
    where: { userId, ...(options.kind ? { kind: options.kind } : {}) },
    orderBy: { createdAt: "desc" },
    take: Math.min(options.limit ?? 12, 50),
    select: {
      id: true,
      kind: true,
      topic: true,
      createdAt: true,
      questionCount: true,
      correctCount: true,
      score: true,
      completedAt: true,
    },
  });
  return rows;
}

/** A single stored artefact, with its full payload. Scoped to its owner. */
export async function getHubArtifact(userId: string, artifactId: string) {
  const artifact = await db.hubArtifact.findFirst({
    where: { id: artifactId, userId },
  });
  if (!artifact) throw notFound("Learning Hub item");

  const payload = parseJson<Record<string, unknown>>(artifact.payload, {});
  if (artifact.kind === "QUIZ") {
    // Never hand back the answer key for a quiz that has not been submitted.
    const questions = Array.isArray(payload.questions) ? (payload.questions as HubQuiz["questions"]) : [];
    return {
      ...artifact,
      payload: {
        overview: payload.overview ?? "",
        questions: questions.map((question, index) => ({
          index,
          question: question.question,
          options: question.options,
          concept: question.concept,
          difficulty: question.difficulty,
          ...(artifact.completedAt
            ? { correctIndex: question.correctIndex, explanation: question.explanation }
            : {}),
        })),
      },
    };
  }
  return { ...artifact, payload };
}

/** Deletes a stored Hub artifact owned by the user. */
export async function deleteHubArtifact(userId: string, artifactId: string): Promise<void> {
  const artifact = await db.hubArtifact.findFirst({
    where: { id: artifactId, userId },
  });
  if (!artifact) throw notFound("Learning Hub item");

  await db.hubArtifact.delete({
    where: { id: artifact.id },
  });
}
