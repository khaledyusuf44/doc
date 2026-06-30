import { getProvider } from "@/lib/ai/config";

export const runtime = "nodejs";
// Each request runs a fresh local generation; nothing here is cacheable.
export const dynamic = "force-dynamic";

type AssistAction = "continue" | "rewrite" | "summarize" | "fix-grammar";

type AssistBody = {
  action?: string;
  text?: string;
  context?: string;
};

const ACTIONS: readonly AssistAction[] = [
  "continue",
  "rewrite",
  "summarize",
  "fix-grammar",
];

function isAction(value: unknown): value is AssistAction {
  return typeof value === "string" && ACTIONS.includes(value as AssistAction);
}

/**
 * Per-action prompt construction. Every system prompt insists on returning ONLY
 * the resulting prose (no preamble, no markdown fences, no commentary) so the
 * client can drop the text straight into the document.
 */
function buildPrompt(
  action: AssistAction,
  text: string,
  context: string | undefined,
): { system: string; prompt: string } {
  const surrounding = context?.trim()
    ? `\n\nFor reference, here is the surrounding document context (do not repeat it, only use it to stay consistent):\n"""\n${context.trim()}\n"""`
    : "";

  switch (action) {
    case "continue":
      return {
        system:
          "You are a writing assistant embedded in a document editor. Continue the user's text naturally, matching their tone, voice, and formatting. Output only the continuation — do not repeat the existing text, do not add headings, quotes, or commentary.",
        prompt: `Continue writing from where this text leaves off:\n"""\n${text}\n"""${surrounding}`,
      };
    case "rewrite":
      return {
        system:
          "You are an editor embedded in a document editor. Rewrite the user's text to be clearer, more concise, and well-structured while preserving its meaning and tone. Output only the rewritten text — no preamble, no explanation, no markdown fences.",
        prompt: `Rewrite the following text:\n"""\n${text}\n"""${surrounding}`,
      };
    case "summarize":
      return {
        system:
          "You are an assistant embedded in a document editor. Summarize the user's text concisely, capturing the key points. Output only the summary — no preamble, no explanation, no markdown fences.",
        prompt: `Summarize the following text:\n"""\n${text}\n"""${surrounding}`,
      };
    case "fix-grammar":
      return {
        system:
          "You are a proofreader embedded in a document editor. Correct spelling, grammar, and punctuation in the user's text. Preserve the original wording, meaning, and tone as much as possible — change only what is necessary. Output only the corrected text — no preamble, no explanation, no markdown fences.",
        prompt: `Fix the grammar and spelling in the following text:\n"""\n${text}\n"""${surrounding}`,
      };
  }
}

export async function POST(request: Request) {
  let body: AssistBody;
  try {
    body = (await request.json()) as AssistBody;
  } catch {
    return Response.json(
      { error: "Invalid JSON body", code: "bad_request" },
      { status: 400 },
    );
  }

  if (!isAction(body.action)) {
    return Response.json(
      { error: "Unknown or missing action", code: "bad_request" },
      { status: 400 },
    );
  }

  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    return Response.json(
      { error: "No text provided", code: "bad_request" },
      { status: 400 },
    );
  }

  const { system, prompt } = buildPrompt(
    body.action,
    text,
    typeof body.context === "string" ? body.context : undefined,
  );

  const provider = getProvider();

  let stream: ReadableStream<Uint8Array>;
  try {
    // generate() awaits the upstream fetch before resolving, so a down backend
    // surfaces here as a thrown error — we catch it and degrade to 503 BEFORE
    // committing to a streaming response.
    stream = await provider.generate({
      system,
      prompt,
      signal: request.signal,
    });
  } catch {
    return Response.json(
      {
        error:
          "Local AI is unavailable. Make sure Ollama is running, then try again.",
        code: "ai_unavailable",
      },
      { status: 503 },
    );
  }

  // Stream the deltas straight through to the client — no buffering, no await.
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
