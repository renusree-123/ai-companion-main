import { z } from "zod";
import { handler, ok, parseQuery } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { HUB_KINDS, listHubArtifacts } from "@/lib/domain/learning-hub";

const query = z.object({
  kind: z.enum(HUB_KINDS).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});

/** GET /api/learning-hub/history — the signed-in user's recent Hub output. */
export const GET = handler(async (request: Request) => {
  const user = await requireUser();
  const { kind, limit } = parseQuery(request, query);

  const items = await listHubArtifacts(user.id, { kind, limit });
  return ok(items, { total: items.length });
});
