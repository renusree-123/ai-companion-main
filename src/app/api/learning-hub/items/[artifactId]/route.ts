import { handler, ok } from "@/lib/http";
import { requireUser } from "@/lib/auth/session";
import { deleteHubArtifact, getHubArtifact } from "@/lib/domain/learning-hub";

type Params = { params: Promise<{ artifactId: string }> };

/**
 * GET /api/learning-hub/items/:artifactId — reopen a stored Hub result.
 *
 * Another user's id returns 404, not 403, matching the rest of the API: a 403
 * would confirm the id exists.
 */
export const GET = handler(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { artifactId } = await params;

  const artifact = await getHubArtifact(user.id, artifactId);
  return ok(artifact);
});

/** DELETE /api/learning-hub/items/:artifactId — delete a stored Hub artifact. */
export const DELETE = handler(async (_request: Request, { params }: Params) => {
  const user = await requireUser();
  const { artifactId } = await params;

  await deleteHubArtifact(user.id, artifactId);
  return ok({ deleted: true });
});
