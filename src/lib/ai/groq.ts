import Groq from "groq-sdk";
import { AppError } from "../errors";
import { parseJson } from "../json";
import { logger } from "../logger";
import type {
  AiCallMeta,
  AiProvider,
  AiResult,
  AiUsage,
  DocumentUnderstandingRequest,
  GenerateStructuredRequest,
  GenerateTextRequest,
  StreamEvent,
  StreamResult,
} from "./types";

/**
 * Groq API provider implementation.
 *
 * Replaces Google Gemini with Groq for high-throughput, low-latency AI inference
 * supporting text generation, structured JSON output, streaming, and document processing.
 */
export class GroqProvider implements AiProvider {
  readonly id = "groq";
  readonly isLive = true;
  readonly model: string;
  private client: Groq;

  constructor(apiKey: string, model: string = "llama-3.3-70b-versatile") {
    this.model = model;
    this.client = new Groq({ apiKey });
  }

  private mapError(error: unknown, action: string): AppError {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      msg.includes("401") ||
      msg.toLowerCase().includes("api key") ||
      msg.toLowerCase().includes("invalid api key")
    ) {
      return new AppError("BAD_REQUEST", `Groq rejected the API key: ${msg}`, {
        userMessage: "The AI provider rejected the API key. Check GROQ_API_KEY in the server environment.",
      });
    }
    if (msg.includes("429") || msg.toLowerCase().includes("rate limit")) {
      return new AppError("RATE_LIMITED", `Groq rate limit reached: ${msg}`, {
        userMessage: "Groq rate limit reached. Please wait a moment and try again.",
      });
    }
    if (msg.includes("timeout")) {
      return new AppError("AI_TIMEOUT", `Groq request timed out: ${msg}`);
    }
    return new AppError("AI_PROVIDER_ERROR", `Groq request (${action}) failed: ${msg}`);
  }

  async generateText(
    request: GenerateTextRequest,
    _meta: AiCallMeta,
  ): Promise<AiResult<string>> {
    const started = Date.now();
    try {
      const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (request.system) {
        messages.push({ role: "system", content: request.system });
      }
      for (const m of request.messages) {
        messages.push({ role: m.role, content: m.content });
      }

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        max_tokens: request.maxTokens ?? 4096,
        stop: request.stopSequences,
      });

      const choice = completion.choices[0];
      const text = choice?.message?.content || "";
      const usage: AiUsage = {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        cachedTokens: 0,
      };

      return {
        value: text,
        usage,
        model: this.model,
        provider: this.id,
        latencyMs: Date.now() - started,
        stopReason: choice?.finish_reason ?? null,
      };
    } catch (err) {
      throw this.mapError(err, "generateText");
    }
  }

  async generateStructured<T>(
    request: GenerateStructuredRequest<T>,
    _meta: AiCallMeta,
  ): Promise<AiResult<T>> {
    const started = Date.now();
    try {
      const systemPrompt = `${request.system}\n\n<json_schema_instructions>\nYou MUST return a JSON object strictly matching this schema for ${request.schemaName} (${request.schemaDescription}):\n${JSON.stringify(request.jsonSchema, null, 2)}\nReturn ONLY the JSON object, with no markdown formatting or text outside the JSON.\n</json_schema_instructions>`;

      const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [
        { role: "system", content: systemPrompt },
      ];
      for (const m of request.messages) {
        messages.push({ role: m.role, content: m.content });
      }

      const completion = await this.client.chat.completions.create({
        model: this.model,
        messages,
        response_format: { type: "json_object" },
        max_tokens: request.maxTokens ?? 4096,
      });

      const choice = completion.choices[0];
      const rawText = choice?.message?.content || "";

      let jsonParsed: unknown;
      try {
        jsonParsed = parseJson(rawText, null);
        if (!jsonParsed) {
          jsonParsed = JSON.parse(
            rawText.replace(/^```json\s*/i, "").replace(/\s*```$/, "").trim(),
          );
        }
      } catch (err) {
        throw new AppError("AI_INVALID_OUTPUT", `Groq returned non-JSON output: ${err}`, {
          cause: err,
        });
      }

      const parsed = request.schema.safeParse(jsonParsed);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        throw new AppError(
          "AI_INVALID_OUTPUT",
          `Groq structured output failed schema validation: ${issues}`,
          {
            userMessage: "The AI generated response did not match expected structure.",
            cause: parsed.error,
          },
        );
      }

      const usage: AiUsage = {
        inputTokens: completion.usage?.prompt_tokens ?? 0,
        outputTokens: completion.usage?.completion_tokens ?? 0,
        cachedTokens: 0,
      };

      return {
        value: parsed.data,
        usage,
        model: this.model,
        provider: this.id,
        latencyMs: Date.now() - started,
        stopReason: choice?.finish_reason ?? null,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw this.mapError(err, "generateStructured");
    }
  }

  async streamText(
    request: GenerateTextRequest,
    _meta: AiCallMeta,
  ): Promise<StreamResult> {
    const started = Date.now();
    try {
      const messages: Groq.Chat.Completions.ChatCompletionMessageParam[] = [];
      if (request.system) {
        messages.push({ role: "system", content: request.system });
      }
      for (const m of request.messages) {
        messages.push({ role: m.role, content: m.content });
      }

      const stream = await this.client.chat.completions.create({
        model: this.model,
        messages,
        stream: true,
        max_tokens: request.maxTokens ?? 4096,
      });

      let fullText = "";
      let lastChoice: Groq.Chat.Completions.ChatCompletionChunk.Choice | undefined;
      const self = this;

      async function* iterate(): AsyncIterable<StreamEvent> {
        try {
          for await (const chunk of stream) {
            const choice = chunk.choices[0];
            if (choice) {
              lastChoice = choice;
              const content = choice.delta?.content || "";
              if (content) {
                fullText += content;
                yield { type: "text", text: content };
              }
            }
          }
          yield { type: "done" };
        } catch (error) {
          logger.error("groq_stream_failed", { error });
          yield { type: "error", error: error instanceof Error ? error.message : String(error) };
        }
      }

      return {
        stream: iterate(),
        final: async () => ({
          value: fullText,
          usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
          model: self.model,
          provider: self.id,
          latencyMs: Date.now() - started,
          stopReason: lastChoice?.finish_reason ?? null,
        }),
      };
    } catch (err) {
      throw this.mapError(err, "streamText");
    }
  }

  async understandDocument(
    request: DocumentUnderstandingRequest,
    meta: AiCallMeta,
  ): Promise<AiResult<string>> {
    let textContent = "";
    try {
      const decoded = Buffer.from(request.pdfBase64, "base64").toString("utf-8");
      textContent = decoded.replace(/[^\x20-\x7E\n\r\t]/g, " ").slice(0, 16000);
    } catch {
      textContent = "[PDF text content extraction fallback]";
    }

    return this.generateText(
      {
        system: "You extract knowledge and answer questions about provided documents.",
        messages: [
          {
            role: "user",
            content: `Instruction: ${request.instruction}\n\nDocument snippet:\n${textContent}`,
          },
        ],
        maxTokens: request.maxTokens,
      },
      meta,
    );
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
    const started = Date.now();
    try {
      await this.client.models.list();
      return {
        ok: true,
        latencyMs: Date.now() - started,
        detail: `Groq provider connected (model: ${this.model})`,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        detail: `Groq connection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
}
