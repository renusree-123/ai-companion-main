import { requireUserPage } from "@/lib/auth/session";
import { ai } from "@/lib/ai/router";
import { listHubArtifacts } from "@/lib/domain/learning-hub";
import { LearningHub } from "@/components/learning-hub";
import { RecentHubList } from "@/components/recent-hub-list";

/**
 * AI Learning Hub.
 *
 * A topic-first workspace that needs no Space, Project or uploaded document —
 * the fastest path from "I want to understand this" to something useful. It
 * complements the grounded, project-scoped experiences rather than replacing
 * them, and says so on every result.
 */
export default async function LearningHubPage() {
  const user = await requireUserPage();
  const provider = ai.describe();
  const history = await listHubArtifacts(user.id, { limit: 10 });

  return (
    <>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 21, fontWeight: 660, letterSpacing: "-0.025em" }}>
          AI Learning Hub
        </h1>
        <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--text-muted)", maxWidth: 640, lineHeight: 1.6 }}>
          Quick AI tools for any topic — no Space, Project or upload needed. For answers grounded in
          your own materials with page citations, use the AI Tutor inside a Project.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) minmax(240px, 300px)",
          gap: 18,
          alignItems: "start",
        }}
      >
        <div style={{ minWidth: 0 }}>
          <LearningHub isLiveProvider={provider.isLive} />
        </div>

        <RecentHubList initialItems={history} />
      </div>
    </>
  );
}
