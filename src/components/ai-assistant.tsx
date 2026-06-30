"use client";

import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Self-contained AI assistance popover. Streams a suggestion from the local
 * `/api/ai/assist` endpoint and lets the user Accept / Reject / Regenerate.
 *
 * No-data-loss guarantee: the document is NEVER mutated until the user clicks
 * Accept. Rejecting, closing, cancelling, or any error leaves the doc untouched.
 */

export type AssistAction = "continue" | "rewrite" | "summarize" | "fix-grammar";

export type AssistSelection = {
  from: number;
  to: number;
  text: string;
};

export type AiAssistantProps = {
  editor: Editor | null;
  action: AssistAction;
  selection: AssistSelection;
  onClose: () => void;
};

type Phase = "streaming" | "done" | "error";

const ACTION_LABELS: Record<AssistAction, string> = {
  continue: "Continue writing",
  rewrite: "Rewrite",
  summarize: "Summarize",
  "fix-grammar": "Fix grammar",
};

export default function AiAssistant({
  editor,
  action,
  selection,
  onClose,
}: AiAssistantProps) {
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<Phase>("streaming");
  const [error, setError] = useState<string | null>(null);
  // Bumping this re-triggers the streaming effect for Regenerate.
  const [runId, setRunId] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  // Stream a fresh suggestion whenever the run id changes (mount + Regenerate).
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    let cancelled = false;

    void (async () => {
      // Reset asynchronously so we don't call setState in the effect body.
      await Promise.resolve();
      if (cancelled) {
        return;
      }
      setText("");
      setError(null);
      setPhase("streaming");
      try {
        const response = await fetch("/api/ai/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            text: selection.text,
            context: selection.text,
          }),
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          let message = "Local AI is unavailable.";
          try {
            const data = (await response.json()) as { error?: string };
            if (data.error) {
              message = data.error;
            }
          } catch {
            // Non-JSON error body; keep the default message.
          }
          if (!cancelled) {
            setError(message);
            setPhase("error");
          }
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          if (chunk && !cancelled) {
            setText((prev) => prev + chunk);
          }
        }
        if (!cancelled) {
          setText((prev) => prev + decoder.decode());
          setPhase("done");
        }
      } catch (err) {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setError(
          err instanceof Error ? err.message : "Could not reach local AI.",
        );
        setPhase("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [action, selection.text, runId]);

  // Close on Escape for keyboard accessibility.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        stop();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, stop]);

  const handleCancel = useCallback(() => {
    stop();
    // Reflect the partial result as a finished (rejectable) suggestion.
    setPhase((prev) => (prev === "streaming" ? "done" : prev));
  }, [stop]);

  const handleReject = useCallback(() => {
    stop();
    onClose();
  }, [onClose, stop]);

  const handleRegenerate = useCallback(() => {
    stop();
    setRunId((id) => id + 1);
  }, [stop]);

  const handleAccept = useCallback(() => {
    stop();
    const value = text.trim();
    if (!editor || !value) {
      onClose();
      return;
    }
    // Single TipTap transaction — the only point at which the doc is mutated.
    if (action === "continue") {
      editor
        .chain()
        .focus()
        .insertContentAt(selection.to, value)
        .run();
    } else {
      editor
        .chain()
        .focus()
        .insertContentAt({ from: selection.from, to: selection.to }, value)
        .run();
    }
    onClose();
  }, [action, editor, onClose, selection.from, selection.to, stop, text]);

  const hasText = text.trim().length > 0;

  return (
    <>
      <button
        aria-label="Dismiss AI assistant"
        className="ai-assistant-backdrop"
        onClick={handleReject}
        type="button"
      />
      <div
        className="ai-assistant-panel"
        role="dialog"
        aria-label="AI assistant"
      >
        <div className="ai-assistant-heading">
          <span className="ai-assistant-title">AI</span>
          <span className="ai-assistant-action-label">
            {ACTION_LABELS[action]}
          </span>
          {phase === "streaming" && (
            <span className="ai-assistant-status">Generating…</span>
          )}
        </div>

        <div className="ai-assistant-body">
          {phase === "error" ? (
            <p className="ai-assistant-error">{error}</p>
          ) : (
            <p className="ai-assistant-output">
              {hasText ? (
                text
              ) : (
                <span className="ai-assistant-placeholder">
                  Waiting for the local model…
                </span>
              )}
            </p>
          )}
        </div>

        <div className="ai-assistant-actions">
          {phase === "streaming" ? (
            <button
              className="ai-assistant-button is-ghost"
              onClick={handleCancel}
              type="button"
            >
              Cancel
            </button>
          ) : (
            <>
              <button
                className="ai-assistant-button is-ghost"
                onClick={handleReject}
                type="button"
              >
                Reject
              </button>
              <button
                className="ai-assistant-button is-ghost"
                onClick={handleRegenerate}
                type="button"
              >
                Regenerate
              </button>
              <button
                className="ai-assistant-button is-primary"
                disabled={phase === "error" || !hasText}
                onClick={handleAccept}
                type="button"
              >
                Accept
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
