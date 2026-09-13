import { NextResponse } from "next/server";
import { ZodError, type TypeOf, type ZodTypeAny } from "zod";
import { AppError, errorMessage, redactDeep, redactSecrets } from "./errors";
import { env } from "./env";
import { logger, newTraceId } from "./logger";

/**
 * Consistent API envelope.
 *   success -> { data, meta? }
 *   failure -> { error: { code, message, details? }, traceId }
 */
export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  hasMore?: boolean;
  traceId?: string;
  [key: string]: unknown;
}

export function ok<T>(data: T, meta?: ApiMeta, status = 200) {
  return NextResponse.json({ data, ...(meta ? { meta } : {}) }, { status });
}

export function created<T>(data: T, meta?: ApiMeta) {
  return ok(data, meta, 201);
}

/**
 * Whether to include internal diagnostics in the response body.
 *
 * Outside production the real message is far more useful in the browser than in
 * a server log nobody has open, and chasing a traceId through a terminal is
 * exactly the friction that makes a one-line bug take an afternoon. Everything
 * added here passes through `redactSecrets` first, and none of it is sent in
 * production.
 */
function includeDiagnostics(): boolean {
  return env().NODE_ENV !== "production";
}

export function fail(error: unknown, traceId = newTraceId()) {
  if (error instanceof AppError) {
    // 4xx is the client's problem and expected traffic; only log 5xx loudly.
    const log = error.status >= 500 ? logger.error : logger.warn;
    // Redacted in the log too: provider errors can carry a request URL, and
    // logs get shipped off the box more often than anyone plans for.
    log.call(logger, "api_error", {
      traceId,
      code: error.code,
      error: redactSecrets(error.message),
    });
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: redactSecrets(error.userMessage),
          details: error.details === undefined ? undefined : redactDeep(error.details),
          // The user-facing message is deliberately gentler than the internal
          // one; in development the internal one is what you actually need.
          ...(includeDiagnostics() && error.message !== error.userMessage
            ? { devMessage: redactSecrets(error.message) }
            : {}),
        },
        traceId,
      },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "The request body failed validation.",
          details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
        },
        traceId,
      },
      { status: 422 },
    );
  }
  logger.error("api_unhandled_error", { traceId, error: redactDeep(errorMessage(error)) });
  return NextResponse.json(
    {
      error: {
        code: "INTERNAL",
        // Never leak an internal message to the client *in production*.
        message: "Something went wrong. Please try again.",
        ...(includeDiagnostics()
          ? {
              devMessage: redactSecrets(errorMessage(error)),
              details: redactDeep({
                name: error instanceof Error ? error.name : typeof error,
                stack:
                  error instanceof Error && error.stack
                    ? error.stack.split("\n").slice(0, 6).join("\n")
                    : undefined,
              }),
            }
          : {}),
      },
      traceId,
    },
    { status: 500 },
  );
}

/**
 * Wraps a route handler with tracing, timing and the error envelope so no
 * handler has to repeat try/catch.
 */
export function handler<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    const traceId = newTraceId();
    const started = Date.now();
    try {
      const response = await fn(...args);
      response.headers.set("x-trace-id", traceId);
      logger.debug("api_request", { traceId, durationMs: Date.now() - started });
      return response;
    } catch (error) {
      return fail(error, traceId);
    }
  };
}

/**
 * Parse and validate a JSON body, mapping malformed JSON to a 400.
 *
 * Generic over the schema rather than over the parsed type, so `.default()`
 * and `.optional()` produce the correct *output* type at the call site — with
 * `ZodSchema<T>` the input and output types are forced equal and every
 * defaulted field would surface as possibly-undefined.
 */
export async function parseBody<S extends ZodTypeAny>(
  request: Request,
  schema: S,
): Promise<TypeOf<S>> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new AppError("BAD_REQUEST", "Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "The request body failed validation.", {
      details: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  return result.data;
}

/** Parse and validate query string parameters. */
export function parseQuery<S extends ZodTypeAny>(request: Request, schema: S): TypeOf<S> {
  const url = new URL(request.url);
  const raw: Record<string, string> = {};
  url.searchParams.forEach((value, key) => {
    raw[key] = value;
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new AppError("VALIDATION_ERROR", "Invalid query parameters.", {
      details: result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
      })),
    });
  }
  return result.data;
}

export function assertOk(condition: unknown, error: AppError): asserts condition {
  if (!condition) throw error;
}

export { errorMessage };
