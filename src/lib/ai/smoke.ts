import "../load-env";
import { db } from "../db";
import { ai, getPrimaryProvider } from "./router";
import { env } from "../env";
import { AppError, errorMessage } from "../errors";
import {
  generateHubExplanation,
  generateHubQuiz,
  generateHubSummary,
} from "../domain/learning-hub";

/**
 * Live end-to-end check of the three AI Learning Hub features against the real
 * Groq API: `npm run ai:smoke`.
 */

const GREEN = "\u001b[32m";
const RED = "\u001b[31m";
const DIM = "\u001b[2m";
const BOLD = "\u001b[1m";
const RESET = "\u001b[0m";

const created: string[] = [];
let failures = 0;

function pass(label: string, detail: string) {
  console.log(`${GREEN}  PASS${RESET} ${label}\n${DIM}       ${detail}${RESET}`);
}

function fail(label: string, error: unknown) {
  failures += 1;
  const code = error instanceof AppError ? error.code : "UNKNOWN";
  console.log(`${RED}  FAIL${RESET} ${label}  ${DIM}[${code}]${RESET}`);
  console.log(`${DIM}       ${errorMessage(error)}${RESET}`);

  if (error instanceof AppError && error.details) {
    console.log(`${DIM}       details: ${JSON.stringify(error.details).slice(0, 400)}${RESET}`);
  }
}

async function preflight(): Promise<boolean> {
  const provider = getPrimaryProvider();
  const model = provider.model;

  console.log(`${DIM}  preflight: ${model}${RESET}`);

  const health = await provider.health();
  if (!health.ok) {
    failures += 1;
    console.log(`\n${RED}  FAIL${RESET} Preflight — the model rejected a minimal request.`);
    console.log(`${DIM}       ${health.detail}${RESET}`);
    return false;
  }

  console.log(`${GREEN}  PASS${RESET} Preflight${DIM} — ${health.detail} (${health.latencyMs}ms)${RESET}\n`);
  return true;
}

async function main() {
  const provider = ai.describe();

  console.log(`\n${BOLD}AI Learning Hub — live smoke test${RESET}`);
  console.log(`${DIM}  provider: ${provider.provider}  model: ${provider.model}`);
  console.log(`  fallback: ${provider.fallbackModel ?? "(none)"}`);
  console.log(
    `  offline fallback: ${env().AI_OFFLINE_FALLBACK === "true" ? "enabled" : "disabled"}${RESET}\n`,
  );

  if (!provider.isLive) {
    console.log(
      `${RED}  No live AI provider configured.${RESET}\n` +
        `${DIM}  Put GROQ_API_KEY in the project root .env and run this again.${RESET}\n`,
    );
    process.exit(1);
  }

  const user = await db.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (!user) {
    console.log(
      `${RED}  No user in the database.${RESET}\n${DIM}  Run \`npm run db:seed\` first.${RESET}\n`,
    );
    process.exit(1);
  }
  console.log(`${DIM}  attributing to: ${user.email}${RESET}\n`);

  if (!(await preflight())) {
    await db.$disconnect();
    process.exit(1);
  }

  // 1. Quiz generator — topic only, no pasted source.
  try {
    const quiz = await generateHubQuiz({
      userId: user.id,
      topic: "Supervised Learning",
      questionCount: 3,
      difficulty: "MIXED",
      sourceContent: "",
    });
    created.push(quiz.artifactId);

    const shapeOk = quiz.questions.every((q) => q.options.length === 4);
    if (!shapeOk) throw new Error("a question did not have exactly four options");

    const stored = await db.hubArtifact.findUniqueOrThrow({ where: { id: quiz.artifactId } });
    const key = (JSON.parse(stored.payload) as { questions: { correctIndex: number }[] }).questions;
    const { submitHubQuiz } = await import("../domain/learning-hub");
    const scored = await submitHubQuiz({
      userId: user.id,
      artifactId: quiz.artifactId,
      answers: key.map((q, index) => ({ index, selectedIndex: q.correctIndex })),
    });
    if (scored.score !== 1) throw new Error(`scoring a perfect attempt gave ${scored.score}`);

    pass(
      "Quiz Generator",
      `${quiz.questions.length} questions, 4 options each, scored ${scored.correctCount}/${scored.questionCount}\n` +
        `       Q1: ${quiz.questions[0].question}`,
    );
  } catch (error) {
    fail("Quiz Generator", error);
  }

  // 2. Summarizer — topic only.
  try {
    const summary = await generateHubSummary({
      userId: user.id,
      topic: "The water cycle",
      sourceContent: "",
      style: "STANDARD",
    });
    created.push(summary.artifactId);

    pass(
      "Summarizer",
      `${summary.summary.length} chars, ${summary.keyPoints.length} key points, ${summary.keyTerms.length} key terms\n` +
        `       ${summary.summary.slice(0, 110).replace(/\s+/g, " ")}…`,
    );
  } catch (error) {
    fail("Summarizer", error);
  }

  // 3. Topic explainer — topic only.
  try {
    const explanation = await generateHubExplanation({
      userId: user.id,
      topic: "Why does compound interest grow so fast?",
      level: "BEGINNER",
      sourceContent: "",
    });
    created.push(explanation.artifactId);

    pass(
      "Topic Explainer",
      `${explanation.keyPoints.length} key points, ${explanation.examples.length} examples\n` +
        `       ${explanation.oneLiner}`,
    );
  } catch (error) {
    fail("Topic Explainer", error);
  }

  const usage = await db.aiRequestLog.findMany({
    where: {
      feature: { in: ["HUB_QUIZ", "HUB_SUMMARY", "HUB_EXPLAIN"] },
      status: { in: ["SUCCESS", "FALLBACK"] },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  const servedOffline = usage.filter((row: { provider: string }) => row.provider !== "groq");
  if (servedOffline.length > 0) {
    failures += 1;
    console.log(
      `\n${RED}  FAIL${RESET} ${servedOffline.length} result(s) came from the offline provider, not Groq.${RESET}`,
    );
  }
  const spend = usage.reduce((sum: number, row: { costUsd: number }) => sum + row.costUsd, 0);
  const models = [...new Set(usage.map((row: { model: string }) => row.model))].join(", ");
  console.log(
    `\n${DIM}  Logged ${usage.length} AI request(s) served by: ${models || "(none)"}.\n` +
      `  Estimated cost $${spend.toFixed(5)}.\n` +
      `  Visible in the app at Admin → AI usage.${RESET}`,
  );

  if (created.length > 0) {
    await db.hubArtifact.deleteMany({ where: { id: { in: created } } });
    console.log(`${DIM}  Cleaned up ${created.length} test artefact(s).${RESET}`);
  }

  console.log(
    failures === 0
      ? `\n${GREEN}${BOLD}  All three Hub features work end to end on ${env().AI_MODEL}.${RESET}\n`
      : `\n${RED}${BOLD}  ${failures} feature(s) failed.${RESET}\n`,
  );
  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (error) => {
  console.error(`\n${RED}  Smoke test crashed: ${errorMessage(error)}${RESET}\n`);
  await db.$disconnect();
  process.exit(1);
});
