"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import katex from "katex";
import { SquareSigma } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";

type RenderResult = {
  html: string;
  error: string | null;
};

// Private-use char marking where the caret should land after an insert.
const CARET = "";

type ToolkitItem = {
  // LaTeX rendered as the button's preview.
  display: string;
  // LaTeX inserted into the field. May contain one CARET marker.
  insert: string;
  // Optional tooltip / accessible label.
  tip?: string;
};

type ToolkitGroup = {
  name: string;
  items: ToolkitItem[];
};

function plain(commands: string[]): ToolkitItem[] {
  return commands.map((command) => ({ display: command, insert: command }));
}

const MATH_GROUPS: ToolkitGroup[] = [
  {
    name: "Basics",
    items: [
      { tip: "Fraction", display: "\\frac{a}{b}", insert: `\\frac{${CARET}}{}` },
      { tip: "Superscript", display: "x^{n}", insert: `^{${CARET}}` },
      { tip: "Subscript", display: "x_{i}", insert: `_{${CARET}}` },
      { tip: "Sub & super", display: "x_{i}^{n}", insert: `_{${CARET}}^{}` },
      { tip: "Square root", display: "\\sqrt{x}", insert: `\\sqrt{${CARET}}` },
      { tip: "nth root", display: "\\sqrt[n]{x}", insert: `\\sqrt[${CARET}]{}` },
      { tip: "Binomial", display: "\\binom{n}{k}", insert: `\\binom{${CARET}}{}` },
      {
        tip: "Parentheses",
        display: "\\left(\\,\\right)",
        insert: `\\left(${CARET}\\right)`,
      },
      {
        tip: "Brackets",
        display: "\\left[\\,\\right]",
        insert: `\\left[${CARET}\\right]`,
      },
      {
        tip: "Braces",
        display: "\\left\\{\\,\\right\\}",
        insert: `\\left\\{${CARET}\\right\\}`,
      },
      {
        tip: "Absolute value",
        display: "\\left|x\\right|",
        insert: `\\left|${CARET}\\right|`,
      },
      { tip: "Text", display: "\\text{abc}", insert: `\\text{${CARET}}` },
    ],
  },
  {
    name: "Greek",
    items: plain([
      "\\alpha",
      "\\beta",
      "\\gamma",
      "\\delta",
      "\\epsilon",
      "\\varepsilon",
      "\\zeta",
      "\\eta",
      "\\theta",
      "\\vartheta",
      "\\iota",
      "\\kappa",
      "\\lambda",
      "\\mu",
      "\\nu",
      "\\xi",
      "\\pi",
      "\\rho",
      "\\sigma",
      "\\tau",
      "\\phi",
      "\\varphi",
      "\\chi",
      "\\psi",
      "\\omega",
      "\\Gamma",
      "\\Delta",
      "\\Theta",
      "\\Lambda",
      "\\Xi",
      "\\Pi",
      "\\Sigma",
      "\\Phi",
      "\\Psi",
      "\\Omega",
    ]),
  },
  {
    name: "Operators",
    items: plain([
      "+",
      "-",
      "\\times",
      "\\div",
      "\\pm",
      "\\mp",
      "\\cdot",
      "\\ast",
      "\\star",
      "\\circ",
      "\\bullet",
      "\\oplus",
      "\\otimes",
      "\\odot",
      "\\cup",
      "\\cap",
      "\\setminus",
      "\\wedge",
      "\\vee",
      "\\neg",
    ]),
  },
  {
    name: "Relations",
    items: plain([
      "=",
      "\\neq",
      "\\approx",
      "\\equiv",
      "\\cong",
      "\\sim",
      "\\simeq",
      "\\propto",
      "\\leq",
      "\\geq",
      "\\ll",
      "\\gg",
      "\\prec",
      "\\succ",
      "\\subset",
      "\\subseteq",
      "\\supseteq",
      "\\in",
      "\\notin",
      "\\ni",
    ]),
  },
  {
    name: "Arrows",
    items: plain([
      "\\to",
      "\\leftarrow",
      "\\rightarrow",
      "\\leftrightarrow",
      "\\Rightarrow",
      "\\Leftarrow",
      "\\Leftrightarrow",
      "\\mapsto",
      "\\uparrow",
      "\\downarrow",
      "\\implies",
      "\\iff",
    ]),
  },
  {
    name: "Calculus",
    items: [
      {
        tip: "Sum",
        display: "\\sum_{i=1}^{n}",
        insert: `\\sum_{${CARET}}^{}`,
      },
      {
        tip: "Product",
        display: "\\prod_{i=1}^{n}",
        insert: `\\prod_{${CARET}}^{}`,
      },
      { tip: "Integral", display: "\\int", insert: `\\int ${CARET}` },
      {
        tip: "Definite integral",
        display: "\\int_{a}^{b}",
        insert: `\\int_{${CARET}}^{}`,
      },
      { tip: "Double integral", display: "\\iint", insert: `\\iint ${CARET}` },
      { tip: "Contour integral", display: "\\oint", insert: `\\oint ${CARET}` },
      {
        tip: "Limit",
        display: "\\lim_{x \\to 0}",
        insert: `\\lim_{${CARET} \\to }`,
      },
      {
        tip: "Derivative",
        display: "\\frac{d}{dx}",
        insert: `\\frac{d}{d${CARET}}`,
      },
      {
        tip: "Partial derivative",
        display: "\\frac{\\partial}{\\partial x}",
        insert: `\\frac{\\partial}{\\partial ${CARET}}`,
      },
      ...plain(["\\partial", "\\nabla", "\\infty"]),
    ],
  },
  {
    name: "Matrices",
    items: [
      {
        tip: "Parentheses matrix",
        display: "\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}",
        insert: `\\begin{pmatrix} ${CARET} & \\\\ & \\end{pmatrix}`,
      },
      {
        tip: "Bracket matrix",
        display: "\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}",
        insert: `\\begin{bmatrix} ${CARET} & \\\\ & \\end{bmatrix}`,
      },
      {
        tip: "Determinant",
        display: "\\begin{vmatrix}a&b\\\\c&d\\end{vmatrix}",
        insert: `\\begin{vmatrix} ${CARET} & \\\\ & \\end{vmatrix}`,
      },
      {
        tip: "Cases",
        display: "\\begin{cases}a\\\\b\\end{cases}",
        insert: `\\begin{cases} ${CARET} & \\\\ & \\end{cases}`,
      },
      { tip: "Vector", display: "\\vec{x}", insert: `\\vec{${CARET}}` },
      { tip: "Hat", display: "\\hat{x}", insert: `\\hat{${CARET}}` },
      { tip: "Bar", display: "\\bar{x}", insert: `\\bar{${CARET}}` },
      { tip: "Overline", display: "\\overline{x}", insert: `\\overline{${CARET}}` },
      { tip: "Tilde", display: "\\tilde{x}", insert: `\\tilde{${CARET}}` },
      { tip: "Dot", display: "\\dot{x}", insert: `\\dot{${CARET}}` },
      { tip: "Double dot", display: "\\ddot{x}", insert: `\\ddot{${CARET}}` },
    ],
  },
  {
    name: "Sets",
    items: plain([
      "\\forall",
      "\\exists",
      "\\nexists",
      "\\emptyset",
      "\\mathbb{R}",
      "\\mathbb{N}",
      "\\mathbb{Z}",
      "\\mathbb{Q}",
      "\\mathbb{C}",
      "\\aleph",
      "\\cdots",
      "\\ldots",
      "\\vdots",
      "\\ddots",
      "\\angle",
      "\\degree",
    ]),
  },
];

const keyCache = new Map<string, string>();

function keyHtml(latex: string): string {
  const cached = keyCache.get(latex);
  if (cached !== undefined) {
    return cached;
  }

  let html: string;
  try {
    html = katex.renderToString(latex, {
      throwOnError: false,
      displayMode: false,
    });
  } catch {
    html = latex;
  }

  keyCache.set(latex, html);
  return html;
}

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

/**
 * Splice `snippet` into a text field at the current selection, honouring a
 * CARET marker for where the caret should end up.
 */
function spliceSnippet(
  field: HTMLTextAreaElement | HTMLInputElement,
  snippet: string,
): { value: string; caret: number } {
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? start;
  const markerAt = snippet.indexOf(CARET);
  const clean = snippet.replace(CARET, "");
  const value = field.value.slice(0, start) + clean + field.value.slice(end);
  const caret = start + (markerAt >= 0 ? markerAt : clean.length);
  return { value, caret };
}

function MathToolkit({
  onInsert,
  compact,
}: {
  onInsert: (snippet: string) => void;
  compact?: boolean;
}) {
  const [group, setGroup] = useState(0);
  const items = MATH_GROUPS[group].items;

  return (
    <div
      className={`math-toolkit ${compact ? "is-compact" : ""}`}
      contentEditable={false}
    >
      <div className="math-toolkit-tabs">
        {MATH_GROUPS.map((entry, index) => (
          <button
            key={entry.name}
            type="button"
            className={index === group ? "is-active" : ""}
            // mousedown + preventDefault keeps focus/selection in the field
            onMouseDown={(event) => {
              event.preventDefault();
              setGroup(index);
            }}
          >
            {entry.name}
          </button>
        ))}
      </div>
      <div className="math-toolkit-grid">
        {items.map((item) => (
          <button
            key={item.display + item.insert}
            type="button"
            className="math-toolkit-key"
            title={item.tip ?? item.display}
            aria-label={item.tip ?? item.display}
            onMouseDown={(event) => {
              event.preventDefault();
              onInsert(item.insert);
            }}
            dangerouslySetInnerHTML={{ __html: keyHtml(item.display) }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * Wires a controlled latex field to the toolkit: returns an insert handler
 * and keeps the caret in place across the controlled re-render.
 */
function useMathField<T extends HTMLTextAreaElement | HTMLInputElement>(
  fieldRef: RefObject<T | null>,
  latex: string,
  setLatex: (value: string) => void,
) {
  const caretRef = useRef<number | null>(null);

  useEffect(() => {
    const field = fieldRef.current;
    if (caretRef.current != null && field) {
      const pos = caretRef.current;
      field.focus();
      field.setSelectionRange(pos, pos);
      caretRef.current = null;
    }
  }, [latex, fieldRef]);

  return useCallback(
    (snippet: string) => {
      const field = fieldRef.current;
      if (!field) {
        return;
      }
      const { value, caret } = spliceSnippet(field, snippet);
      caretRef.current = caret;
      setLatex(value);
    },
    [fieldRef, setLatex],
  );
}

function MathInlineView({ node, updateAttributes, selected }: NodeViewProps) {
  const latex = latexAttr(node.attrs.latex);
  const [editing, setEditing] = useState(() => !latex.trim());
  const [showToolkit, setShowToolkit] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const rendered = useMemo(() => renderKatex(latex, false), [latex]);

  const setLatex = useCallback(
    (value: string) => updateAttributes({ latex: value }),
    [updateAttributes],
  );
  const insert = useMathField(inputRef, latex, setLatex);

  const closeEditing = useCallback(() => {
    setShowToolkit(false);
    setEditing(false);
  }, []);

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
        <span className="math-inline-edit">
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
            onBlur={() => closeEditing()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === "Escape") {
                event.preventDefault();
                closeEditing();
              }
            }}
          />
          <button
            type="button"
            className={`math-toolkit-trigger ${showToolkit ? "is-active" : ""}`}
            title="Math toolkit"
            aria-label="Math toolkit"
            onMouseDown={(event) => {
              event.preventDefault();
              setShowToolkit((value) => !value);
            }}
          >
            <SquareSigma size={14} />
          </button>
          {showToolkit && (
            <span className="math-inline-popover">
              <MathToolkit compact onInsert={insert} />
            </span>
          )}
        </span>
      ) : (
        <span
          className="math-inline-render"
          role="button"
          tabIndex={0}
          title="Click to edit formula"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setEditing(true);
          }}
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
  const [toolkitOpen, setToolkitOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const rendered = useMemo(() => renderKatex(latex, true), [latex]);

  const setLatex = useCallback(
    (value: string) => updateAttributes({ latex: value }),
    [updateAttributes],
  );
  const insert = useMathField(textareaRef, latex, setLatex);

  const closeEditing = useCallback(() => {
    setToolkitOpen(false);
    setEditing(false);
  }, []);

  useEffect(() => {
    if (editing) {
      textareaRef.current?.focus();
    }
  }, [editing]);

  return (
    <NodeViewWrapper
      as="div"
      className={`math-display-block ${selected ? "is-selected" : ""} ${
        editing ? "is-editing" : ""
      }`}
      contentEditable={false}
      data-type="math-block"
    >
      <div
        className="math-display"
        role="button"
        tabIndex={0}
        title="Click to edit equation"
        // Open on mousedown and stop ProseMirror from grabbing focus, which
        // would otherwise blur the editor field and close it immediately.
        onMouseDown={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setEditing(true);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            setEditing(true);
          }
        }}
      >
        {rendered.error ? (
          <span className="math-error">{rendered.error}</span>
        ) : rendered.html ? (
          <span dangerouslySetInnerHTML={{ __html: rendered.html }} />
        ) : (
          <span className="math-empty">Click to add an equation</span>
        )}
      </div>

      {editing && (
        <div className="math-editor-pop">
          <div className="math-editor-row">
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
              onBlur={() => closeEditing()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  closeEditing();
                }
              }}
            />
            <button
              type="button"
              className={`math-toolkit-trigger block ${
                toolkitOpen ? "is-active" : ""
              }`}
              title="Math toolkit"
              aria-label="Math toolkit"
              onMouseDown={(event) => {
                event.preventDefault();
                setToolkitOpen((value) => !value);
              }}
            >
              <SquareSigma size={15} />
            </button>
          </div>
          {toolkitOpen && <MathToolkit onInsert={insert} />}
          <div className="math-editor-hint">
            Press Esc or click away when you&apos;re done.
          </div>
        </div>
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
