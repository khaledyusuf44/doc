/**
 * Provider-agnostic contract for local AI assistance. Implementations talk to
 * whatever local backend is configured (default: Ollama). Nothing here assumes
 * a cloud service — everything is expected to run on the user's machine.
 */

export type GenerateOptions = {
  /** Optional system prompt steering the model's behavior. */
  system?: string;
  /** The user-facing prompt to complete. */
  prompt: string;
  /** Abort signal so the caller can cancel an in-flight generation. */
  signal?: AbortSignal;
};

export type HealthResult = {
  /** True when the backend answered and is ready to serve requests. */
  ok: boolean;
  /** Names of the models the backend currently has available. */
  models: string[];
};

export interface AiProvider {
  /**
   * Stream a completion as UTF-8 text deltas. The returned stream emits the
   * model's output incrementally so callers can render tokens as they arrive.
   */
  generate(options: GenerateOptions): Promise<ReadableStream<Uint8Array>>;

  /** Embed one or more texts, returning a vector per input (same order). */
  embed(texts: string[]): Promise<number[][]>;

  /** Cheap liveness/capability probe; never throws on a down backend. */
  health(): Promise<HealthResult>;
}
