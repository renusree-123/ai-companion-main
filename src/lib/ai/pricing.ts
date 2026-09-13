/**
 * Per-model pricing in USD per million tokens, for cost tracking (PRD §43).
 *
 * These are list prices captured at build time; they are used for *estimated*
 * cost only and are labelled as such in the UI. Cached input reads are billed
 * at a fraction of the input rate.
 */
interface Price {
  input: number;
  output: number;
  cachedInput: number;
}

// Paid-tier list prices. Free-tier usage is not billed at all, so for a
// free-tier key these figures are an upper bound rather than a charge — which
// is the useful thing to show an operator watching for a runaway workflow.
// Cached input reads are billed at roughly a tenth of the input rate.
const PRICES: Record<string, Price> = {
  "groq/compound": { input: 0.59, output: 0.79, cachedInput: 0.059 },
  "groq/compound-mini": { input: 0.05, output: 0.08, cachedInput: 0.005 },
  "llama-3.3-70b-versatile": { input: 0.59, output: 0.79, cachedInput: 0.059 },
  "llama-3.1-8b-instant": { input: 0.05, output: 0.08, cachedInput: 0.005 },
  "mixtral-8x7b-32768": { input: 0.24, output: 0.24, cachedInput: 0.024 },
  "gemma2-9b-it": { input: 0.2, output: 0.2, cachedInput: 0.02 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, cachedInput: 0.03 },
  "claude-opus-5": { input: 5, output: 15, cachedInput: 0.5 },
  "offline-deterministic": { input: 0, output: 0, cachedInput: 0 },
};

const DEFAULT: Price = { input: 5, output: 15, cachedInput: 0.5 };

export function priceFor(model: string): Price {
  return PRICES[model] ?? DEFAULT;
}

export function estimateCostUsd(
  model: string,
  usage: { inputTokens: number; outputTokens: number; cachedTokens?: number },
): number {
  const price = priceFor(model);
  const cached = usage.cachedTokens ?? 0;
  const fresh = Math.max(0, usage.inputTokens - cached);
  const cost =
    (fresh / 1_000_000) * price.input +
    (cached / 1_000_000) * price.cachedInput +
    (usage.outputTokens / 1_000_000) * price.output;
  // Round to a tenth of a cent's thousandth — enough precision for per-request rows.
  return Math.round(cost * 1e8) / 1e8;
}

/**
 * Rough token estimate for budget pre-checks and for the offline provider,
 * where no real tokeniser runs. ~4 characters per token for English prose.
 */
export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

export const KNOWN_MODELS = Object.keys(PRICES);
