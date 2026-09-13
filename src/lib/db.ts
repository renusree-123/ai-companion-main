import { PrismaClient } from "@prisma/client";
import { env } from "./env";

/**
 * Prisma singleton. Next.js dev mode re-evaluates modules on every hot reload,
 * which would otherwise leak a connection pool per reload.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function configureDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || !url.startsWith("postgres")) return undefined;

  try {
    const parsed = new URL(url);
    let modified = false;
    if (!parsed.searchParams.has("connection_limit")) {
      const defaultLimit = process.env.VERCEL ? "3" : "15";
      parsed.searchParams.set("connection_limit", defaultLimit);
      modified = true;
    }
    if (!parsed.searchParams.has("pool_timeout")) {
      parsed.searchParams.set("pool_timeout", "30");
      modified = true;
    }
    if (!parsed.searchParams.has("connect_timeout")) {
      parsed.searchParams.set("connect_timeout", "15");
      modified = true;
    }
    return modified ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

const datasourceUrl = configureDatasourceUrl();

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log: env().LOG_LEVEL === "debug" ? ["warn", "error", "query"] : ["warn", "error"],
  });

globalForPrisma.prisma = db;

/** Cheap liveness probe used by the admin System Health page. */
export async function pingDatabase(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return { ok: true, latencyMs: Date.now() - started };
  } catch (error) {
    return {
      ok: false,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
