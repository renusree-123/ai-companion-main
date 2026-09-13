import { describe, expect, it } from "vitest";
import { GroqProvider } from "@/lib/ai/groq";
import { priceFor, estimateCostUsd } from "@/lib/ai/pricing";

describe("GroqProvider", () => {
  it("initializes with groq provider id and default model", () => {
    const provider = new GroqProvider("test-groq-key", "llama-3.3-70b-versatile");
    expect(provider.id).toBe("groq");
    expect(provider.model).toBe("llama-3.3-70b-versatile");
    expect(provider.isLive).toBe(true);
  });
});

describe("Groq Pricing & Cost Estimation", () => {
  it("returns pricing for Groq models", () => {
    const price70b = priceFor("llama-3.3-70b-versatile");
    expect(price70b.input).toBe(0.59);
    expect(price70b.output).toBe(0.79);

    const price8b = priceFor("llama-3.1-8b-instant");
    expect(price8b.input).toBe(0.05);
    expect(price8b.output).toBe(0.08);
  });

  it("estimates costs accurately for token usage", () => {
    const cost = estimateCostUsd("llama-3.3-70b-versatile", {
      inputTokens: 1000,
      outputTokens: 500,
    });
    expect(cost).toBeGreaterThan(0);
  });
});
