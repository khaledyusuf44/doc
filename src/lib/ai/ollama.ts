import type { AiConfig } from "./config";
import type {
  AiProvider,
  GenerateOptions,
  HealthResult,
} from "./provider";

/**
 * Ollama implementation of AiProvider, built on plain fetch — no SDK, no extra
 * dependencies. Talks to a local Ollama daemon over its HTTP API.
 */

const HEALTH_TIMEOUT_MS = 1500;

type OllamaChatChunk = {
  message?: { content?: string };
  done?: boolean;
};

type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

type OllamaEmbedResponse = {
  embeddings?: number[][];
};

/** Detect a "nothing is listening" connection failure vs. any other error. */
function isConnectionRefused(error: unknown): boolean {
  if (error instanceof Error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    const code = cause?.code;
    if (
      code === "ECONNREFUSED" ||
      code === "ENOTFOUND" ||
      code === "EAI_AGAIN" ||
      code === "ECONNRESET"
    ) {
      return true;
    }
    if (/fetch failed|ECONNREFUSED|network/i.test(error.message)) {
      return true;
    }
  }
  return false;
}

export function createOllamaProvider(config: AiConfig): AiProvider {
  return {
    async generate({
      system,
      prompt,
      signal,
    }: GenerateOptions): Promise<ReadableStream<Uint8Array>> {
      const messages: Array<{ role: string; content: string }> = [];
      if (system) {
        messages.push({ role: "system", content: system });
      }
      messages.push({ role: "user", content: prompt });

      const response = await fetch(`${config.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.model,
          messages,
          stream: true,
        }),
        signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(
          `Ollama chat request failed (${response.status} ${response.statusText})`,
        );
      }

      const upstream = response.body;
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      // Ollama streams newline-delimited JSON (NDJSON). We parse each complete
      // line, pull out message.content, and re-emit just the text deltas so the
      // caller receives a clean stream of plain-text tokens.
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          const reader = upstream.getReader();
          let buffer = "";

          const flushLine = (line: string) => {
            const trimmed = line.trim();
            if (!trimmed) {
              return;
            }
            try {
              const chunk = JSON.parse(trimmed) as OllamaChatChunk;
              const content = chunk.message?.content;
              if (content) {
                controller.enqueue(encoder.encode(content));
              }
            } catch {
              // Ignore malformed/partial lines; a later iteration may complete
              // the buffer, or the line was a keep-alive we don't care about.
            }
          };

          try {
            for (;;) {
              const { done, value } = await reader.read();
              if (done) {
                break;
              }
              buffer += decoder.decode(value, { stream: true });
              let newlineIndex = buffer.indexOf("\n");
              while (newlineIndex !== -1) {
                flushLine(buffer.slice(0, newlineIndex));
                buffer = buffer.slice(newlineIndex + 1);
                newlineIndex = buffer.indexOf("\n");
              }
            }
            // Emit any trailing partial line left in the buffer.
            buffer += decoder.decode();
            flushLine(buffer);
            controller.close();
          } catch (error) {
            controller.error(error);
          } finally {
            reader.releaseLock();
          }
        },
        cancel() {
          // Propagate consumer cancellation upstream so Ollama stops generating.
          void upstream.cancel();
        },
      });
    },

    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) {
        return [];
      }
      const response = await fetch(`${config.host}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: config.embedModel,
          input: texts,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama embed request failed (${response.status} ${response.statusText})`,
        );
      }

      const data = (await response.json()) as OllamaEmbedResponse;
      return data.embeddings ?? [];
    },

    async health(): Promise<HealthResult> {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
      try {
        const response = await fetch(`${config.host}/api/tags`, {
          method: "GET",
          signal: controller.signal,
        });
        if (!response.ok) {
          return { ok: false, models: [] };
        }
        const data = (await response.json()) as OllamaTagsResponse;
        const models = (data.models ?? [])
          .map((entry) => entry.name ?? entry.model ?? "")
          .filter((name): name is string => name.length > 0);
        return { ok: true, models };
      } catch (error) {
        // A refused connection (Ollama not running) or a timeout both mean the
        // backend is simply unavailable — report that gracefully, never throw.
        if (isConnectionRefused(error) || controller.signal.aborted) {
          return { ok: false, models: [] };
        }
        return { ok: false, models: [] };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
