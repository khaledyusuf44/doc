"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import katex from "katex";
import { SquareSigma } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type RenderResult = {
  html: string;
  error: string | null;
};

function latexAttr(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function renderKatex(latex: string, displayMode: boolean): RenderResult {
  const source = latex.trim();
  if (!source) {
    return { html: "", error: null };
  }

  try {
    const html = katex.renderToString(source, {
      displayMode,
      throwOnError: true,
      errorColor: "#dc2626",
      strict: false,
    });
    return { html, error: null };
  } catch (error) {
    return {
      html: "",
      error: error instanceof Error ? error.message : "Invalid LaTeX",
    };
  }
}

function MathInlineView({ node, updateAttributes, selected }: NodeViewProps) {
  const latex = latexAttr(node.attrs.latex);
  const [editing, setEditing] = useState(() => !latex.trim());
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rendered = useMemo(() => renderKatex(latex, false), [latex]);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
    }
  }, [editing]);

  return (
    <NodeViewWrapper
      as="span"
      className={`math-inline ${selected ? "is-selected" : ""} ${
        editing ? "is-editing" : ""
      }`}
      contentEditable={false}
      data-type="math-inline"
    >
      {editing ? (
        <input
          ref={inputRef}
          aria-label="Inline formula (LaTeX)"
          className="math-inline-input"
          value={latex}
          placeholder="e = mc^2"
          spellCheck={false}
          onChange={(event) =>
            updateAttributes({ latex: event.currentTarget.value })
          }
          onBlur={() => setEditing(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
        />
      ) : (
        <span
          className="math-inline-render"
          role="button"
          tabIndex={0}
          title="Click to edit formula"
          onClick={() => setEditing(true)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              setEditing(true);
            }
          }}
        >
          {rendered.error ? (
            <span className="math-error">{latex || "formula"}</span>
          ) : rendered.html ? (
            <span dangerouslySetInnerHTML={{ __html: rendered.html }} />
          ) : (
            <span className="math-empty">formula</span>
          )}
        </span>
      )}
    </NodeViewWrapper>
  );
}

function MathBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const latex = latexAttr(node.attrs.latex);
  const [editing, setEditing] = useState(() => !latex.trim());
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rendered = useMemo(() => renderKatex(latex, true), [latex]);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
    }
  }, [editing]);

  return (
    <NodeViewWrapper
      className={`local-block math-block ${selected ? "is-selected" : ""}`}
      contentEditable={false}
      data-type="math-block"
    >
      <div className="block-heading">
        <span className="block-icon">
          <SquareSigma size={16} />
        </span>
        <span className="math-block-label">Equation</span>
        <button
          className="math-edit-toggle"
          type="button"
          onClick={() => setEditing((value) => !value)}
        >
          {editing ? "Preview" : "Edit"}
        </button>
      </div>

      <div
        className="math-preview"
        role="button"
        tabIndex={0}
        onClick={() => setEditing(true)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            setEditing(true);
          }
        }}
      >
        {rendered.error ? (
          <span className="math-error">{rendered.error}</span>
        ) : rendered.html ? (
          <span dangerouslySetInnerHTML={{ __html: rendered.html }} />
        ) : (
          <span className="math-empty">Click to add a formula</span>
        )}
      </div>

      {editing && (
        <textarea
          ref={textareaRef}
          aria-label="Equation (LaTeX)"
          className="math-source"
          value={latex}
          spellCheck={false}
          placeholder={"\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}"}
          onChange={(event) =>
            updateAttributes({ latex: event.currentTarget.value })
          }
        />
      )}
    </NodeViewWrapper>
  );
}

export const MathInline = Node.create({
  name: "mathInline",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-latex") ?? "",
        renderHTML: (attributes) => ({ "data-latex": attributes.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="math-inline"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const latex = latexAttr(node.attrs.latex);

    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "math-inline" }),
      latex,
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathInlineView);
  },
});

export const MathBlock = Node.create({
  name: "mathBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      latex: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-latex") ?? "",
        renderHTML: (attributes) => ({ "data-latex": attributes.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-type="math-block"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const latex = latexAttr(node.attrs.latex);

    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-type": "math-block" }),
      ["pre", latex],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(MathBlockView);
  },
});
