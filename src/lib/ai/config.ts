import type { AiProvider } from "./provider";
import { createOllamaProvider } from "./ollama";

/**
 * Local-first AI configuration. Everything resolves from the environment with
 * safe local defaults so the app works out of the box against a local Ollama
 * install — no cloud, no API keys, no required setup.
 */
export type AiConfig = {
  host: string;
  model: string;
  embedModel: string;
};

const DEFAULTS = {
  host: "http://localhost:11434",
  model: "llama3.2",
  embedModel: "nomic-embed-text",
} as const;

function clean(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : fallback;
}

export function getConfig(): AiConfig {
  return {
    // Trailing slash trimmed so we can always join paths as `${host}/api/...`.
    host: clean(process.env.OLLAMA_HOST, DEFAULTS.host).replace(/\/+$/, ""),
    model: clean(process.env.OLLAMA_MODEL, DEFAULTS.model),
    embedModel: clean(process.env.OLLAMA_EMBED_MODEL, DEFAULTS.embedModel),
  };
}

/**
 * Resolve the active AI provider. Today this is always local Ollama; the
 * indirection keeps the route handlers provider-agnostic so a different local
 * backend could be swapped in without touching them.
 */
export function getProvider(): AiProvider {
  return createOllamaProvider(getConfig());
}
