"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import { BarChart3, Brush, Eraser } from "lucide-react";
import { PointerEvent, useEffect, useMemo, useRef, useState } from "react";

type ChartDatum = {
  label: string;
  value: number;
};

type Point = {
  x: number;
  y: number;
};

type Stroke = {
  color: string;
  width: number;
  points: Point[];
};

const CHART_EXAMPLE = "Clarity,8\nMomentum,6\nOpen questions,4";
const CANVAS_WIDTH = 1200;
const CANVAS_HEIGHT = 420;
const PEN_COLORS = ["#1f2937", "#2563eb", "#16a34a", "#f97316", "#e11d48"];

function textAttr(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function parseChart(raw: string): ChartDatum[] {
  return raw
    .split(/\n+/)
    .map((line) => {
      const [label, value] = line.split(/[,:\t]/);
      return {
        label: label?.trim() || "Untitled",
        value: Number.parseFloat(value ?? "0"),
      };
    })
    .filter((item) => Number.isFinite(item.value));
}

function parseStrokes(raw: unknown): Stroke[] {
  if (typeof raw !== "string" || !raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as Stroke[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (stroke) =>
        typeof stroke.color === "string" &&
        typeof stroke.width === "number" &&
        Array.isArray(stroke.points),
    );
  } catch {
    return [];
  }
}

function ChartBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const title = textAttr(node.attrs.title, "Signal chart");
  const data = textAttr(node.attrs.data, CHART_EXAMPLE);
  const rows = useMemo(() => parseChart(data), [data]);
  const max = Math.max(...rows.map((row) => row.value), 1);

  return (
    <NodeViewWrapper
      className={`local-block chart-block ${selected ? "is-selected" : ""}`}
      contentEditable={false}
      data-type="chart-block"
    >
      <div className="block-heading">
        <span className="block-icon">
          <BarChart3 size={16} />
        </span>
        <input
          aria-label="Chart title"
          value={title}
          onChange={(event) =>
            updateAttributes({ title: event.currentTarget.value })
          }
        />
      </div>

      <div className="chart-layout">
        <textarea
          aria-label="Chart data"
          value={data}
          spellCheck={false}
          onChange={(event) =>
            updateAttributes({ data: event.currentTarget.value })
          }
        />

        <div className="chart-bars">
          {rows.map((row) => (
            <div className="chart-row" key={`${row.label}-${row.value}`}>
              <span>{row.label}</span>
              <div className="chart-track">
                <div
                  className="chart-fill"
                  style={{ width: `${Math.max((row.value / max) * 100, 4)}%` }}
                />
              </div>
              <strong>{row.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </NodeViewWrapper>
  );
}

function SketchBlockView({ node, updateAttributes, selected }: NodeViewProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const strokesRef = useRef<Stroke[]>(parseStrokes(node.attrs.strokes));
  const activeStrokeRef = useRef<Stroke | null>(null);
  const [color, setColor] = useState(PEN_COLORS[0]);

  const redraw = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) {
      return;
    }

    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    for (const stroke of strokesRef.current) {
      if (stroke.points.length < 2) {
        continue;
      }

      context.beginPath();
      context.lineCap = "round";
      context.lineJoin = "round";
      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.width;
      context.moveTo(stroke.points[0].x, stroke.points[0].y);

      for (const point of stroke.points.slice(1)) {
        context.lineTo(point.x, point.y);
      }

      context.stroke();
    }
  };

  useEffect(() => {
    strokesRef.current = parseStrokes(node.attrs.strokes);
    redraw();
  }, [node.attrs.strokes]);

  const pointFromEvent = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  };

  const persist = () => {
    updateAttributes({ strokes: JSON.stringify(strokesRef.current) });
  };

  const startStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const stroke: Stroke = {
      color,
      width: 5,
      points: [pointFromEvent(event)],
    };
    activeStrokeRef.current = stroke;
    strokesRef.current = [...strokesRef.current, stroke];
  };

  const continueStroke = (event: PointerEvent<HTMLCanvasElement>) => {
    const stroke = activeStrokeRef.current;
    if (!stroke) {
      return;
    }

    stroke.points.push(pointFromEvent(event));
    redraw();
  };

  const endStroke = () => {
    if (!activeStrokeRef.current) {
      return;
    }

    activeStrokeRef.current = null;
    persist();
  };

  const clear = () => {
    strokesRef.current = [];
    persist();
    redraw();
  };

  return (
    <NodeViewWrapper
      className={`local-block sketch-block ${selected ? "is-selected" : ""}`}
      contentEditable={false}
      data-type="sketch-block"
    >
      <div className="block-heading">
        <span className="block-icon">
          <Brush size={16} />
        </span>
        <input
          aria-label="Sketch title"
          value={textAttr(node.attrs.title, "Sketch board")}
          onChange={(event) =>
            updateAttributes({ title: event.currentTarget.value })
          }
        />
        <div className="sketch-tools">
          {PEN_COLORS.map((penColor) => (
            <button
              aria-label={`Use ${penColor}`}
              className={penColor === color ? "is-active" : ""}
              key={penColor}
              onClick={() => setColor(penColor)}
              style={{ background: penColor }}
              title={penColor}
              type="button"
            />
          ))}
          <button
            aria-label="Clear sketch"
            className="clear-sketch"
            onClick={clear}
            title="Clear"
            type="button"
          >
            <Eraser size={15} />
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        onPointerDown={startStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
    </NodeViewWrapper>
  );
}

export const ChartBlock = Node.create({
  name: "chartBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      title: {
        default: "Signal chart",
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
      data: {
        default: CHART_EXAMPLE,
        parseHTML: (element) => element.getAttribute("data-chart-data"),
        renderHTML: (attributes) => ({ "data-chart-data": attributes.data }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-type="chart-block"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const title = textAttr(node.attrs.title, "Signal chart");
    const data = textAttr(node.attrs.data, CHART_EXAMPLE);

    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-type": "chart-block" }),
      ["h3", title],
      ["pre", data],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartBlockView);
  },
});

export const SketchBlock = Node.create({
  name: "sketchBlock",
  group: "block",
  atom: true,

  addAttributes() {
    return {
      title: {
        default: "Sketch board",
        parseHTML: (element) => element.getAttribute("data-title"),
        renderHTML: (attributes) => ({ "data-title": attributes.title }),
      },
      strokes: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-strokes"),
        renderHTML: (attributes) => ({ "data-strokes": attributes.strokes }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'section[data-type="sketch-block"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const title = textAttr(node.attrs.title, "Sketch board");

    return [
      "section",
      mergeAttributes(HTMLAttributes, { "data-type": "sketch-block" }),
      ["h3", title],
      ["p", "Sketch content is stored in the rich JSON document."],
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(SketchBlockView);
  },
});
