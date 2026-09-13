/**
 * One-off script: populate realistic analytics source data (concepts,
 * mastery history, quizzes, tutor conversations, AI usage logs, activity
 * events, recommendations) across the real (non-demo) projects so the
 * Analytics / Growth pages have something to show. Local sqlite dev DB only.
 *
 * Run with: npx tsx _tmp_seed_analytics.ts
 */
import "./src/lib/load-env";
import { db } from "./src/lib/db";
import { recalculateTrends } from "./src/lib/domain/mastery";
import { rollupDailyStats } from "./src/lib/domain/analytics";

const WINDOW_DAYS = 21;

function dateAt(daysAgo: number, hour = 12, minute = 0): Date {
  const d = new Date();
  d.setUTCHours(hour, minute, 0, 0);
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// ---------------------------------------------------------------------------
// Concept specs per project. `shape` drives the mastery trajectory:
//  - improving: rising steadily -> IMPROVING trend
//  - attention: low & flat/declining -> NEEDS_ATTENTION trend
//  - stable: flat, well-practiced -> STABLE trend
//  - new: a single very recent data point -> NEW trend
// ---------------------------------------------------------------------------

type Shape = "improving" | "attention" | "stable" | "new";

interface ConceptSpec {
  name: string;
  description: string;
  importance: number;
  shape: Shape;
  level: number; // current/target level
}

const PROJECT_CONCEPTS: Record<string, ConceptSpec[]> = {
  "Computer vision": [
    { name: "Convolution & Filters", description: "Sliding-window feature extraction over images.", importance: 0.85, shape: "improving", level: 0.78 },
    { name: "Pooling & Downsampling", description: "Reducing spatial resolution while keeping salient features.", importance: 0.6, shape: "stable", level: 0.7 },
    { name: "Transfer Learning", description: "Reusing pretrained backbones for new vision tasks.", importance: 0.8, shape: "improving", level: 0.82 },
    { name: "Object Detection", description: "Localising and classifying multiple objects in an image.", importance: 0.75, shape: "attention", level: 0.38 },
    { name: "Image Segmentation", description: "Pixel-level classification, semantic vs instance.", importance: 0.65, shape: "attention", level: 0.42 },
    { name: "Data Augmentation", description: "Synthetic variation to reduce overfitting on small datasets.", importance: 0.5, shape: "stable", level: 0.66 },
    { name: "Batch Normalization", description: "Stabilising activations across a mini-batch.", importance: 0.45, shape: "new", level: 0.3 },
  ],
  "Supervised  learning": [
    { name: "Bias-Variance Tradeoff", description: "Balancing underfitting against overfitting.", importance: 0.8, shape: "improving", level: 0.76 },
    { name: "Cross-Validation", description: "Estimating generalisation error via repeated splits.", importance: 0.6, shape: "stable", level: 0.72 },
    { name: "Regularization (L1/L2)", description: "Penalising large weights to reduce overfitting.", importance: 0.7, shape: "improving", level: 0.8 },
    { name: "Gradient Descent", description: "Iteratively updating parameters to reduce loss.", importance: 0.85, shape: "stable", level: 0.74 },
    { name: "Precision & Recall", description: "Trading off false positives against false negatives.", importance: 0.65, shape: "attention", level: 0.4 },
    { name: "Decision Tree Splitting", description: "Choosing features/thresholds via Gini or information gain.", importance: 0.5, shape: "attention", level: 0.35 },
    { name: "Feature Scaling", description: "Normalising inputs for distance- and gradient-based models.", importance: 0.4, shape: "new", level: 0.28 },
  ],
  "Spaced Repetition & Retrieval": [
    { name: "Spacing Effect", description: "Distributed practice beats massed practice.", importance: 0.9, shape: "improving", level: 0.85 },
    { name: "Retrieval Practice", description: "Active recall strengthens retention more than re-reading.", importance: 0.85, shape: "improving", level: 0.8 },
    { name: "Interleaving", description: "Mixing topics instead of blocking by topic.", importance: 0.6, shape: "stable", level: 0.68 },
    { name: "Forgetting Curve", description: "Ebbinghaus's exponential memory decay model.", importance: 0.55, shape: "stable", level: 0.7 },
    { name: "Desirable Difficulty", description: "Learning conditions that feel harder but retain better.", importance: 0.5, shape: "attention", level: 0.44 },
    { name: "Elaborative Interrogation", description: "Asking why/how to connect new facts to existing knowledge.", importance: 0.4, shape: "new", level: 0.32 },
  ],
  "Radiative Balance & Feedbacks": [
    { name: "Albedo", description: "Fraction of incoming solar radiation reflected by a surface.", importance: 0.7, shape: "improving", level: 0.79 },
    { name: "Radiative Forcing", description: "A change in Earth's energy balance, in W/m².", importance: 0.8, shape: "stable", level: 0.71 },
    { name: "Greenhouse Effect", description: "Gases absorbing and re-emitting outgoing longwave radiation.", importance: 0.85, shape: "improving", level: 0.83 },
    { name: "Ice-Albedo Feedback", description: "Melting ice lowers albedo, amplifying warming.", importance: 0.6, shape: "attention", level: 0.41 },
    { name: "Water Vapor Feedback", description: "Warming increases atmospheric moisture, amplifying warming further.", importance: 0.55, shape: "attention", level: 0.37 },
    { name: "Climate Sensitivity", description: "Temperature change expected per CO2 doubling.", importance: 0.5, shape: "new", level: 0.3 },
  ],
  Optimization: [
    { name: "Convexity", description: "Functions guaranteeing a single global minimum.", importance: 0.65, shape: "stable", level: 0.73 },
    { name: "Learning Rate", description: "Step size hyperparameter in gradient-based optimisation.", importance: 0.8, shape: "improving", level: 0.81 },
    { name: "Momentum", description: "Smoothing updates using a moving average of past gradients.", importance: 0.6, shape: "improving", level: 0.77 },
    { name: "Adam Optimizer", description: "Adaptive per-parameter learning rates with momentum.", importance: 0.7, shape: "attention", level: 0.39 },
    { name: "Saddle Points", description: "Zero-gradient points that are neither minima nor maxima.", importance: 0.45, shape: "attention", level: 0.36 },
    { name: "Stochastic Gradient Descent", description: "Gradient descent over random mini-batches.", importance: 0.55, shape: "new", level: 0.31 },
  ],
};

const TUTOR_EXCHANGES: Record<string, [string, string][]> = {
  "Computer vision": [
    ["Why does pooling help reduce overfitting?", "Pooling shrinks the spatial size of feature maps, cutting the parameter count downstream and adding translation invariance, which makes it harder for the network to memorise exact pixel positions."],
    ["When should I use transfer learning instead of training from scratch?", "Reach for transfer learning whenever your dataset is small relative to the task's complexity — a backbone pretrained on a large, similar dataset already encodes low- and mid-level features you'd otherwise need thousands of examples to learn."],
    ["What's the practical difference between semantic and instance segmentation?", "Semantic segmentation only cares about the class label per pixel, so two overlapping cars become one blob. Instance segmentation also separates individual object instances, so each car gets its own mask."],
  ],
  "Supervised  learning": [
    ["How do I know if my model is overfitting?", "Watch the gap between training and validation loss — if training loss keeps falling while validation loss flattens or rises, that gap is the signature of overfitting."],
    ["Why does L2 regularization help more than L1 sometimes?", "L2 shrinks all weights smoothly toward zero without forcing exact zeros, which tends to work better when most features carry some signal; L1 is better when you actually want sparsity — a few features mattering a lot."],
    ["What does k=5 mean in k-fold cross-validation?", "It means the data is split into 5 equal folds; you train on 4 and validate on the remaining 1, rotating through all 5 combinations, then average the validation scores."],
  ],
  "Spaced Repetition & Retrieval": [
    ["Why is cramming worse than spacing even if total study time is equal?", "Massed practice creates an illusion of fluency because the material is still in short-term memory, but that fluency doesn't transfer to long-term retention the way spaced, effortful recall does."],
    ["How does interleaving improve learning compared to blocking?", "Interleaving forces you to discriminate between problem types on each attempt instead of pattern-matching to the last one you saw, which strengthens the ability to recognise which method applies in a new situation."],
  ],
  "Radiative Balance & Feedbacks": [
    ["Why is water vapor considered a feedback and not a forcing?", "Because its atmospheric concentration responds to temperature rather than driving it directly — warming from an external forcing like CO2 increases evaporation, which then amplifies the original warming."],
    ["What's the difference between radiative forcing and climate sensitivity?", "Radiative forcing is the size of the initial energy imbalance a factor introduces; climate sensitivity is how much equilibrium temperature change results once feedbacks have played out."],
  ],
  Optimization: [
    ["Why does Adam usually converge faster than plain SGD?", "Adam adapts the effective learning rate per parameter using running estimates of the first and second moments of the gradient, so it can take larger steps in flat directions and smaller ones where gradients are noisy."],
    ["What actually happens at a saddle point during training?", "The gradient vanishes just like at a minimum, but the surface curves up in some directions and down in others — plain gradient descent can stall there, which is part of why momentum-based methods help."],
  ],
};

async function upsertConcept(projectId: string, spec: ConceptSpec) {
  const slug = spec.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
  return db.concept.upsert({
    where: { projectId_slug: { projectId, slug } },
    create: {
      projectId,
      name: spec.name,
      slug,
      description: spec.description,
      importance: spec.importance,
      sourceCount: 1 + Math.floor(Math.random() * 3),
    },
    update: { description: spec.description, importance: spec.importance },
  });
}

/** Builds a mastery snapshot trajectory (oldest -> newest) for one concept shape. */
function buildTrajectory(shape: Shape, target: number): { daysAgo: number; level: number }[] {
  const noise = () => (Math.random() - 0.5) * 0.04;
  switch (shape) {
    case "improving": {
      const start = clamp01(target - 0.28);
      return [18, 14, 10, 7, 4, 1].map((d, i, arr) => ({
        daysAgo: d,
        level: clamp01(start + ((target - start) * (i + 1)) / arr.length + noise()),
      }));
    }
    case "attention": {
      const start = clamp01(target + 0.14);
      return [16, 12, 8, 5, 2].map((d, i, arr) => ({
        daysAgo: d,
        level: clamp01(start - ((start - target) * (i + 1)) / arr.length + noise()),
      }));
    }
    case "stable": {
      return [17, 12, 8, 4, 1].map((d) => ({ daysAgo: d, level: clamp01(target + noise()) }));
    }
    case "new":
      return [1].map((d) => ({ daysAgo: d, level: clamp01(target + noise()) }));
  }
}

async function seedConceptMastery(projectId: string, userId: string, spec: ConceptSpec) {
  const concept = await upsertConcept(projectId, spec);
  const points = buildTrajectory(spec.shape, spec.level);

  await db.masterySnapshot.deleteMany({ where: { conceptId: concept.id } });
  for (const point of points) {
    await db.masterySnapshot.create({
      data: {
        projectId,
        conceptId: concept.id,
        level: point.level,
        confidence: clamp01(0.2 + 0.1 * points.indexOf(point)),
        source: Math.random() < 0.75 ? "QUIZ" : "TUTOR",
        createdAt: dateAt(point.daysAgo, 9 + Math.floor(Math.random() * 10)),
      },
    });
  }

  const last = points[points.length - 1];
  const first = points[0];
  const evidenceCount = points.length + Math.floor(Math.random() * 3);
  const accuracy = spec.shape === "attention" ? 0.35 + Math.random() * 0.15 : 0.65 + Math.random() * 0.25;
  const attemptCount = evidenceCount;
  const correctCount = Math.round(attemptCount * accuracy);

  await db.mastery.upsert({
    where: { projectId_conceptId: { projectId, conceptId: concept.id } },
    create: {
      projectId,
      userId,
      conceptId: concept.id,
      level: last.level,
      previousLevel: first.level,
      confidence: clamp01(0.25 + 0.08 * evidenceCount),
      evidenceCount,
      correctCount,
      attemptCount,
      trend: "NEW",
      lastEventAt: dateAt(last.daysAgo),
    },
    update: {
      level: last.level,
      previousLevel: first.level,
      confidence: clamp01(0.25 + 0.08 * evidenceCount),
      evidenceCount,
      correctCount,
      attemptCount,
      lastEventAt: dateAt(last.daysAgo),
    },
  });

  return concept;
}

async function seedQuizzes(
  projectId: string,
  userId: string,
  concepts: { id: string; name: string }[],
) {
  const quizDays = [15, 11, 8, 5, 2, 0].filter(() => Math.random() > 0.1);
  for (const daysAgo of quizDays) {
    const startedAt = dateAt(daysAgo, 9 + Math.floor(Math.random() * 8));
    const isLatest = daysAgo === Math.min(...quizDays);
    const completed = !(isLatest && Math.random() < 0.2);
    const questionCount = 5;
    const quiz = await db.quiz.create({
      data: {
        projectId,
        userId,
        status: completed ? "COMPLETED" : "ACTIVE",
        mode: Math.random() < 0.7 ? "ADAPTIVE" : "CONCEPT_FOCUS",
        plannedCount: questionCount,
        answeredCount: completed ? questionCount : Math.floor(questionCount / 2),
        startedAt,
        completedAt: completed ? dateAt(daysAgo, 9 + Math.floor(Math.random() * 8) + 1) : null,
      },
    });

    let correct = 0;
    let scoreSum = 0;
    const answeredCount = completed ? questionCount : Math.floor(questionCount / 2);

    for (let i = 0; i < questionCount; i++) {
      const concept = concepts[(i + quizDays.indexOf(daysAgo)) % concepts.length];
      const type = Math.random() < 0.75 ? "MCQ" : "OPEN";
      const difficulty = pick(["EASY", "MEDIUM", "HARD"]);
      const question = await db.quizQuestion.create({
        data: {
          quizId: quiz.id,
          index: i,
          type,
          prompt: `Question about ${concept.name}`,
          options: type === "MCQ" ? JSON.stringify(["Option A", "Option B", "Option C", "Option D"]) : "[]",
          correctIndex: type === "MCQ" ? 0 : null,
          referenceAnswer: type === "OPEN" ? `A correct answer touches on ${concept.name}.` : "",
          conceptId: concept.id,
          difficulty,
        },
      });

      if (i >= answeredCount) continue;

      const isCorrect = type === "MCQ" ? Math.random() < 0.72 : Math.random() < 0.6;
      const score = type === "MCQ" ? (isCorrect ? 1 : 0) : clamp01(0.3 + Math.random() * 0.7);
      if (isCorrect) correct += 1;
      scoreSum += score;

      await db.quizAnswer.create({
        data: {
          questionId: question.id,
          quizId: quiz.id,
          userId,
          rawAnswer: type === "MCQ" ? "Option A" : `My understanding of ${concept.name}...`,
          selectedIndex: type === "MCQ" ? (isCorrect ? 0 : 1 + Math.floor(Math.random() * 3)) : null,
          isCorrect,
          score,
          feedback: type === "OPEN" ? "Solid grasp of the core idea, could be more precise." : "",
          evaluatedBy: type === "OPEN" ? "llama-3.3-70b-versatile" : "rule",
          latencyMs: type === "OPEN" ? 600 + Math.floor(Math.random() * 900) : 0,
          answeredAt: dateAt(daysAgo, 9 + Math.floor(Math.random() * 8)),
        },
      });

      if (type === "OPEN") {
        await db.aiRequestLog.create({
          data: {
            traceId: `seed-${quiz.id}-${i}`,
            userId,
            projectId,
            feature: "OPEN_GRADING",
            provider: "groq",
            model: "llama-3.3-70b-versatile",
            status: "SUCCESS",
            latencyMs: 600 + Math.floor(Math.random() * 900),
            inputTokens: 300 + Math.floor(Math.random() * 200),
            outputTokens: 80 + Math.floor(Math.random() * 60),
            costUsd: 0.001 + Math.random() * 0.004,
            createdAt: dateAt(daysAgo, 9),
          },
        });
      }
    }

    await db.quiz.update({
      where: { id: quiz.id },
      data: { correctCount: correct, score: answeredCount > 0 ? scoreSum / answeredCount : 0 },
    });

    await db.aiRequestLog.create({
      data: {
        traceId: `seed-quizgen-${quiz.id}`,
        userId,
        projectId,
        feature: "QUIZ_GENERATION",
        provider: "groq",
        model: "llama-3.3-70b-versatile",
        status: "SUCCESS",
        latencyMs: 900 + Math.floor(Math.random() * 1200),
        inputTokens: 800 + Math.floor(Math.random() * 400),
        outputTokens: 500 + Math.floor(Math.random() * 300),
        costUsd: 0.003 + Math.random() * 0.006,
        createdAt: startedAt,
      },
    });

    await recordActivityAt(userId, "QUIZ_STARTED", projectId, startedAt);
    if (completed) {
      await recordActivityAt(userId, "QUIZ_COMPLETED", projectId, dateAt(daysAgo, 10));
    }
  }
}

async function recordActivityAt(
  userId: string,
  type: string,
  projectId: string,
  createdAt: Date,
) {
  await db.activityEvent.create({
    data: { userId, type, projectId, summary: "", payload: "{}", createdAt },
  });
}

async function seedTutorActivity(projectId: string, userId: string, projectName: string) {
  const exchanges = TUTOR_EXCHANGES[projectName] ?? [];
  if (exchanges.length === 0) return;

  const convoDays = [13, 6, 1];
  for (const daysAgo of convoDays) {
    const createdAt = dateAt(daysAgo, 10 + Math.floor(Math.random() * 6));
    const conversation = await db.conversation.create({
      data: {
        projectId,
        userId,
        title: `Study session — ${projectName}`,
        createdAt,
        lastMessageAt: createdAt,
        messageCount: exchanges.length * 2,
      },
    });

    for (const [question, answer] of exchanges) {
      await db.message.create({
        data: {
          conversationId: conversation.id,
          role: "user",
          content: question,
          createdAt,
        },
      });
      await db.message.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: answer,
          model: "llama-3.3-70b-versatile",
          latencyMs: 700 + Math.floor(Math.random() * 900),
          inputTokens: 400 + Math.floor(Math.random() * 300),
          outputTokens: 150 + Math.floor(Math.random() * 150),
          grounding: "GROUNDED",
          createdAt,
        },
      });
      await db.aiRequestLog.create({
        data: {
          traceId: `seed-tutor-${conversation.id}-${question.slice(0, 8)}`,
          userId,
          projectId,
          feature: "TUTOR",
          provider: "groq",
          model: "llama-3.3-70b-versatile",
          status: "SUCCESS",
          latencyMs: 700 + Math.floor(Math.random() * 900),
          inputTokens: 400 + Math.floor(Math.random() * 300),
          outputTokens: 150 + Math.floor(Math.random() * 150),
          costUsd: 0.0008 + Math.random() * 0.002,
          createdAt,
        },
      });
    }

    await recordActivityAt(userId, "CONVERSATION_STARTED", projectId, createdAt);
    await recordActivityAt(userId, "TUTOR_QUESTION_ASKED", projectId, createdAt);
  }
}

async function seedRecommendation(
  projectId: string,
  userId: string,
  weakest: { id: string; name: string } | undefined,
) {
  if (!weakest) return;
  await db.recommendation.upsert({
    where: { projectId_dedupeKey: { projectId, dedupeKey: `seed-weak-${weakest.id}` } },
    create: {
      userId,
      projectId,
      title: `Review ${weakest.name}`,
      body: `Your recent answers suggest ${weakest.name} needs another pass — a short quiz focused on it should help.`,
      actionType: "TAKE_QUIZ",
      actionPayload: JSON.stringify({ conceptId: weakest.id, conceptName: weakest.name }),
      conceptIds: JSON.stringify([weakest.id]),
      rationale: "Low mastery with a flat or declining trend over the last two weeks.",
      priority: 0.8,
      status: "ACTIVE",
      generatedBy: "RULE",
      dedupeKey: `seed-weak-${weakest.id}`,
      createdAt: dateAt(2),
    },
    update: {},
  });
}

async function seedProjectAccessEvents(projectId: string, userId: string) {
  for (const daysAgo of [9, 6, 3, 1, 0]) {
    await recordActivityAt(userId, "PROJECT_ACCESSED", projectId, dateAt(daysAgo, 8));
  }
}

async function main() {
  const projects = await db.project.findMany({
    select: { id: true, userId: true, name: true },
  });

  for (const project of projects) {
    const specs = PROJECT_CONCEPTS[project.name];
    if (!specs) continue;

    console.log(`Seeding analytics for "${project.name}"...`);

    const concepts = [];
    for (const spec of specs) {
      const concept = await seedConceptMastery(project.id, project.userId, spec);
      concepts.push({ id: concept.id, name: concept.name, shape: spec.shape });
    }

    await seedQuizzes(
      project.id,
      project.userId,
      concepts.map((c) => ({ id: c.id, name: c.name })),
    );
    await seedTutorActivity(project.id, project.userId, project.name);
    await seedProjectAccessEvents(project.id, project.userId);

    const weakest = concepts.find((c) => c.shape === "attention");
    await seedRecommendation(project.id, project.userId, weakest);

    await recalculateTrends(project.id);
    await rollupDailyStats(project.id, WINDOW_DAYS);

    console.log(`  done: ${concepts.length} concepts`);
  }

  console.log("\nAnalytics seed complete.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
