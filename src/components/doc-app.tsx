"use client";

import { ChartBlock, SketchBlock } from "@/components/editor-blocks";
import { MathBlock, MathInline } from "@/components/math-blocks";
import type { Content, JSONContent } from "@tiptap/core";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import Highlight from "@tiptap/extension-highlight";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TextAlign from "@tiptap/extension-text-align";
import { FontFamily, FontSize, TextStyle } from "@tiptap/extension-text-style";
import Underline from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDownToLine,
  ArrowUpToLine,
  BarChart3,
  Bold,
  BookOpen,
  Brush,
  CheckSquare,
  Clock3,
  Code2,
  FilePlus2,
  Gauge,
  Heading1,
  Heading2,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTree,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  Pilcrow,
  Quote,
  Redo2,
  Save,
  Search,
  Sigma,
  SquareSigma,
  Table2,
  Trash2,
  Underline as UnderlineIcon,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import TurndownService from "turndown";

type DocMeta = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  excerpt: string;
  markdownPath: string;
};

type StoredDoc = DocMeta & {
  content: JSONContent | null;
  html: string;
  markdown: string;
};

type SaveState = "loading" | "dirty" | "saving" | "saved" | "error";

type DocHeading = {
  id: string;
  level: number;
  position: number;
  text: string;
};

type DocStats = {
  characters: number;
  headings: DocHeading[];
  readingMinutes: number;
  words: number;
};

const EMPTY_CONTENT: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const EMPTY_STATS: DocStats = {
  characters: 0,
  headings: [],
  readingMinutes: 0,
  words: 0,
};

const CHART_CONTENT: Content = {
  type: "chartBlock",
  attrs: {
    title: "Signal chart",
    data: "Clarity,8\nMomentum,6\nOpen questions,4",
  },
};

const CHART_INSERT: Content = [CHART_CONTENT, { type: "paragraph" }];

const SKETCH_CONTENT: Content = {
  type: "sketchBlock",
  attrs: {
    title: "Sketch board",
    strokes: "",
  },
};

const SKETCH_INSERT: Content = [SKETCH_CONTENT, { type: "paragraph" }];

const MATH_INLINE_INSERT: Content = {
  type: "mathInline",
  attrs: { latex: "" },
};

const MATH_BLOCK_INSERT: Content = [
  { type: "mathBlock", attrs: { latex: "" } },
  { type: "paragraph" },
];

const FONT_FAMILIES = [
  { label: "Sans", value: "" },
  { label: "Serif", value: "Georgia, serif" },
  { label: "Mono", value: "var(--font-geist-mono), monospace" },
  { label: "Arial", value: "Arial, Helvetica, sans-serif" },
  { label: "Times", value: "'Times New Roman', Times, serif" },
];

const FONT_SIZES = ["12", "14", "16", "18", "20", "24", "28", "32", "40"];

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function docSummary(doc: StoredDoc): DocMeta {
  return {
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    tags: doc.tags,
    excerpt: doc.excerpt,
    markdownPath: doc.markdownPath,
  };
}

function sortDocs(docs: DocMeta[]) {
  return [...docs].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

function readEditorStats(editor: Editor | null): DocStats {
  if (!editor) {
    return EMPTY_STATS;
  }

  const text = editor.getText({ blockSeparator: " " }).trim();
  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const headings: DocHeading[] = [];

  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== "heading") {
      return;
    }

    const headingText = node.textContent.replace(/\s+/g, " ").trim();
    if (!headingText) {
      return;
    }

    headings.push({
      id: `${position}-${headingText}`,
      level: Number(node.attrs.level) || 1,
      position: position + 1,
      text: headingText,
    });
  });

  return {
    characters: text.replace(/\s/g, "").length,
    headings,
    readingMinutes: words ? Math.max(1, Math.ceil(words / 220)) : 0,
    words,
  };
}

function ToolbarButton({
  active,
  disabled,
  icon: Icon,
  label,
  onClick,
}: {
  active?: boolean;
  disabled?: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className={classNames("tool-button", active && "is-active")}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        if (!disabled) {
          onClick();
        }
      }}
      title={label}
      type="button"
    >
      <Icon size={17} strokeWidth={2.2} />
    </button>
  );
}

function ToolbarGroup({ children }: { children: React.ReactNode }) {
  return <div className="tool-group">{children}</div>;
}

function currentBlockStyle(editor: Editor | null) {
  if (!editor) {
    return "paragraph";
  }

  if (editor.isActive("heading", { level: 1 })) return "heading-1";
  if (editor.isActive("heading", { level: 2 })) return "heading-2";
  if (editor.isActive("heading", { level: 3 })) return "heading-3";
  if (editor.isActive("blockquote")) return "blockquote";
  if (editor.isActive("codeBlock")) return "codeBlock";
  return "paragraph";
}

function applyBlockStyle(editor: Editor | null, value: string) {
  if (!editor) {
    return;
  }

  const chain = editor.chain().focus();

  if (value === "heading-1") {
    chain.setHeading({ level: 1 }).run();
    return;
  }

  if (value === "heading-2") {
    chain.setHeading({ level: 2 }).run();
    return;
  }

  if (value === "heading-3") {
    chain.setHeading({ level: 3 }).run();
    return;
  }

  if (value === "blockquote") {
    chain.setParagraph().toggleBlockquote().run();
    return;
  }

  if (value === "codeBlock") {
    chain.setParagraph().toggleCodeBlock().run();
    return;
  }

  chain.setParagraph().run();
}

function EditorToolbar({
  editor,
  onImage,
  onSave,
}: {
  editor: Editor | null;
  onImage: () => void;
  onSave: () => void;
}) {
  const disabled = !editor;
  const fontFamily = (editor?.getAttributes("textStyle").fontFamily ??
    "") as string;
  const fontSize = ((editor?.getAttributes("textStyle").fontSize as
    | string
    | undefined) ?? "16px").replace("px", "");

  return (
    <div className="editor-toolbar" aria-label="Editor toolbar">
      <ToolbarGroup>
        <select
          aria-label="Paragraph style"
          className="toolbar-select style-select"
          disabled={disabled}
          onChange={(event) => applyBlockStyle(editor, event.currentTarget.value)}
          title="Paragraph style"
          value={currentBlockStyle(editor)}
        >
          <option value="paragraph">Normal text</option>
          <option value="heading-1">Heading 1</option>
          <option value="heading-2">Heading 2</option>
          <option value="heading-3">Heading 3</option>
          <option value="blockquote">Quote</option>
          <option value="codeBlock">Code block</option>
        </select>
      </ToolbarGroup>

      <ToolbarGroup>
        <select
          aria-label="Font family"
          className="toolbar-select font-select"
          disabled={disabled}
          onChange={(event) => {
            const value = event.currentTarget.value;
            if (value) {
              editor?.chain().focus().setFontFamily(value).run();
            } else {
              editor?.chain().focus().unsetFontFamily().run();
            }
          }}
          title="Font"
          value={fontFamily}
        >
          {FONT_FAMILIES.map((font) => (
            <option key={font.label} value={font.value}>
              {font.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Font size"
          className="toolbar-select size-select"
          disabled={disabled}
          onChange={(event) =>
            editor
              ?.chain()
              .focus()
              .setFontSize(`${event.currentTarget.value}px`)
              .run()
          }
          title="Font size"
          value={FONT_SIZES.includes(fontSize) ? fontSize : "16"}
        >
          {FONT_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          disabled={disabled}
          icon={Undo2}
          label="Undo"
          onClick={() => editor?.chain().focus().undo().run()}
        />
        <ToolbarButton
          disabled={disabled}
          icon={Redo2}
          label="Redo"
          onClick={() => editor?.chain().focus().redo().run()}
        />
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          active={editor?.isActive("heading", { level: 1 })}
          disabled={disabled}
          icon={Heading1}
          label="Heading 1"
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 1 }).run()
          }
        />
        <ToolbarButton
          active={editor?.isActive("heading", { level: 2 })}
          disabled={disabled}
          icon={Heading2}
          label="Heading 2"
          onClick={() =>
            editor?.chain().focus().toggleHeading({ level: 2 }).run()
          }
        />
        <ToolbarButton
          active={editor?.isActive("blockquote")}
          disabled={disabled}
          icon={Quote}
          label="Quote"
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        />
        <ToolbarButton
          active={editor?.isActive("codeBlock")}
          disabled={disabled}
          icon={Code2}
          label="Code block"
          onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
        />
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          active={editor?.isActive("bold")}
          disabled={disabled}
          icon={Bold}
          label="Bold"
          onClick={() => editor?.chain().focus().toggleBold().run()}
        />
        <ToolbarButton
          active={editor?.isActive("italic")}
          disabled={disabled}
          icon={Italic}
          label="Italic"
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        />
        <ToolbarButton
          active={editor?.isActive("underline")}
          disabled={disabled}
          icon={UnderlineIcon}
          label="Underline"
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        />
        <ToolbarButton
          active={editor?.isActive("highlight")}
          disabled={disabled}
          icon={Highlighter}
          label="Highlight"
          onClick={() => editor?.chain().focus().toggleHighlight().run()}
        />
        <ToolbarButton
          active={editor?.isActive("link")}
          disabled={disabled}
          icon={Link2}
          label="Link"
          onClick={() => {
            const previous = editor?.getAttributes("link").href as
              | string
              | undefined;
            const href = window.prompt("Link", previous ?? "https://");

            if (href === null) {
              return;
            }

            if (!href.trim()) {
              editor?.chain().focus().unsetLink().run();
              return;
            }

            editor?.chain().focus().setLink({ href }).run();
          }}
        />
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          active={editor?.isActive("bulletList")}
          disabled={disabled}
          icon={List}
          label="Bullet list"
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        />
        <ToolbarButton
          active={editor?.isActive("orderedList")}
          disabled={disabled}
          icon={ListOrdered}
          label="Numbered list"
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        />
        <ToolbarButton
          active={editor?.isActive("taskList")}
          disabled={disabled}
          icon={CheckSquare}
          label="Checklist"
          onClick={() => editor?.chain().focus().toggleTaskList().run()}
        />
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          active={editor?.isActive({ textAlign: "left" })}
          disabled={disabled}
          icon={AlignLeft}
          label="Align left"
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
        />
        <ToolbarButton
          active={editor?.isActive({ textAlign: "center" })}
          disabled={disabled}
          icon={AlignCenter}
          label="Align center"
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
        />
        <ToolbarButton
          active={editor?.isActive({ textAlign: "right" })}
          disabled={disabled}
          icon={AlignRight}
          label="Align right"
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
        />
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton
          disabled={disabled}
          icon={Table2}
          label="Table"
          onClick={() =>
            editor
              ?.chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
        />
        <ToolbarButton
          disabled={disabled}
          icon={ImagePlus}
          label="Image"
          onClick={onImage}
        />
        <ToolbarButton
          disabled={disabled}
          icon={BarChart3}
          label="Chart"
          onClick={() => editor?.chain().focus().insertContent(CHART_INSERT).run()}
        />
        <ToolbarButton
          disabled={disabled}
          icon={Brush}
          label="Sketch"
          onClick={() => editor?.chain().focus().insertContent(SKETCH_INSERT).run()}
        />
        <ToolbarButton
          active={editor?.isActive("mathInline")}
          disabled={disabled}
          icon={Sigma}
          label="Inline formula"
          onClick={() =>
            editor?.chain().focus().insertContent(MATH_INLINE_INSERT).run()
          }
        />
        <ToolbarButton
          disabled={disabled}
          icon={SquareSigma}
          label="Equation block"
          onClick={() =>
            editor?.chain().focus().insertContent(MATH_BLOCK_INSERT).run()
          }
        />
      </ToolbarGroup>

      <ToolbarGroup>
        <ToolbarButton disabled={disabled} icon={Save} label="Save" onClick={onSave} />
      </ToolbarGroup>
    </div>
  );
}

function DocumentUtilityBar({
  headings,
  onJumpToHeading,
  onScrollToBottom,
  onScrollToTop,
  progress,
  stats,
}: {
  headings: DocHeading[];
  onJumpToHeading: (position: number) => void;
  onScrollToBottom: () => void;
  onScrollToTop: () => void;
  progress: number;
  stats: DocStats;
}) {
  return (
    <div className="doc-utility-bar" aria-label="Document utilities">
      <div className="utility-left">
        <label className="outline-select">
          <ListTree size={16} />
          <select
            aria-label="Document outline"
            disabled={headings.length === 0}
            onChange={(event) => {
              const position = Number(event.currentTarget.value);
              event.currentTarget.value = "";
              if (Number.isFinite(position)) {
                onJumpToHeading(position);
              }
            }}
            value=""
          >
            <option value="">
              {headings.length ? "Outline" : "No headings"}
            </option>
            {headings.map((heading) => (
              <option key={heading.id} value={heading.position}>
                {"  ".repeat(Math.max(heading.level - 1, 0))}
                {heading.text}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="utility-stats" aria-label="Document stats">
        <span title="Words">
          <Pilcrow size={14} />
          {stats.words.toLocaleString()} words
        </span>
        <span title="Reading time">
          <Clock3 size={14} />
          {stats.readingMinutes || 0} min
        </span>
        <span title="Scroll progress">
          <Gauge size={14} />
          {Math.round(progress)}%
        </span>
      </div>

      <div className="utility-actions">
        <button
          aria-label="Jump to top"
          className="utility-button"
          onClick={onScrollToTop}
          title="Top"
          type="button"
        >
          <ArrowUpToLine size={16} />
        </button>
        <button
          aria-label="Jump to bottom"
          className="utility-button"
          onClick={onScrollToBottom}
          title="Bottom"
          type="button"
        >
          <ArrowDownToLine size={16} />
        </button>
      </div>

      <div className="utility-progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
    </div>
  );
}

export default function DocApp() {
  const [docs, setDocs] = useState<DocMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [title, setTitle] = useState("Untitled");
  const [query, setQuery] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("loading");
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [docStats, setDocStats] = useState<DocStats>(EMPTY_STATS);
  const [scrollProgress, setScrollProgress] = useState(0);

  const activeIdRef = useRef<string | null>(null);
  const bootstrappedRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const titleReadyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const paperWrapRef = useRef<HTMLDivElement | null>(null);
  const scheduleSaveRef = useRef<() => void>(() => undefined);

  const markdownService = useMemo(() => {
    const service = new TurndownService({
      bulletListMarker: "-",
      codeBlockStyle: "fenced",
      headingStyle: "atx",
    });

    service.addRule("chartBlock", {
      filter: (node) =>
        node.nodeType === 1 &&
        (node as HTMLElement).getAttribute("data-type") === "chart-block",
      replacement: (_content, node) => {
        const element = node as HTMLElement;
        const chartTitle = element.getAttribute("data-title") ?? "Chart";
        const data = element.getAttribute("data-chart-data") ?? "";
        return `\n\n:::chart ${chartTitle}\n${data}\n:::\n\n`;
      },
    });

    service.addRule("mathInline", {
      filter: (node) =>
        node.nodeType === 1 &&
        (node as HTMLElement).getAttribute("data-type") === "math-inline",
      replacement: (_content, node) => {
        const latex = (node as HTMLElement).getAttribute("data-latex") ?? "";
        return latex.trim() ? `$${latex.trim()}$` : "";
      },
    });

    service.addRule("mathBlock", {
      filter: (node) =>
        node.nodeType === 1 &&
        (node as HTMLElement).getAttribute("data-type") === "math-block",
      replacement: (_content, node) => {
        const latex = (node as HTMLElement).getAttribute("data-latex") ?? "";
        return latex.trim() ? `\n\n$$\n${latex.trim()}\n$$\n\n` : "";
      },
    });

    service.addRule("sketchBlock", {
      filter: (node) =>
        node.nodeType === 1 &&
        (node as HTMLElement).getAttribute("data-type") === "sketch-block",
      replacement: (_content, node) => {
        const element = node as HTMLElement;
        const sketchTitle = element.getAttribute("data-title") ?? "Sketch";
        return `\n\n:::sketch ${sketchTitle}\nStored in content.json\n:::\n\n`;
      },
    });

    return service;
  }, []);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: false,
        underline: false,
      }),
      Underline,
      Link.configure({
        autolink: true,
        defaultProtocol: "https",
        openOnClick: false,
      }),
      Image.configure({
        allowBase64: true,
        inline: false,
      }),
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({
        placeholder: "Start writing...",
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
      }),
      Highlight,
      TextStyle,
      FontFamily,
      FontSize,
      ChartBlock,
      SketchBlock,
      MathInline,
      MathBlock,
    ],
    [],
  );

  const editor = useEditor({
    content: EMPTY_CONTENT,
    editorProps: {
      attributes: {
        class: "doc-editor",
      },
    },
    extensions,
    immediatelyRender: false,
    onUpdate: () => {
      if (!applyingRemoteRef.current) {
        scheduleSaveRef.current();
      }
    },
  });

  const updateScrollProgress = useCallback(() => {
    const container = paperWrapRef.current;
    if (!container) {
      setScrollProgress(0);
      return;
    }

    const scrollable = container.scrollHeight - container.clientHeight;
    const nextProgress =
      scrollable > 0 ? (container.scrollTop / scrollable) * 100 : 0;
    setScrollProgress(Math.min(100, Math.max(0, nextProgress)));
  }, []);

  const scrollPaperTo = useCallback(
    (position: "bottom" | "top") => {
      const container = paperWrapRef.current;
      if (!container) {
        return;
      }

      container.scrollTo({
        behavior: "smooth",
        top: position === "top" ? 0 : container.scrollHeight,
      });
      window.setTimeout(updateScrollProgress, 240);
    },
    [updateScrollProgress],
  );

  const jumpToHeading = useCallback(
    (position: number) => {
      editor?.chain().focus().setTextSelection(position).scrollIntoView().run();
      window.setTimeout(updateScrollProgress, 240);
    },
    [editor, updateScrollProgress],
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    const updateStats = () => {
      setDocStats(readEditorStats(editor));
      window.requestAnimationFrame(updateScrollProgress);
    };

    updateStats();
    editor.on("update", updateStats);

    return () => {
      editor.off("update", updateStats);
    };
  }, [editor, updateScrollProgress]);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const syncSidebarToViewport = () => {
      setSidebarOpen(!media.matches);
    };
    const timer = window.setTimeout(() => {
      if (media.matches) {
        setSidebarOpen(false);
      }
    }, 0);

    media.addEventListener("change", syncSidebarToViewport);

    return () => {
      window.clearTimeout(timer);
      media.removeEventListener("change", syncSidebarToViewport);
    };
  }, []);

  const toMarkdown = useCallback(
    (html: string) => {
      const markdown = markdownService.turndown(html).trim();
      return markdown ? `${markdown}\n` : "";
    },
    [markdownService],
  );

  const refreshDocs = useCallback(async () => {
    const response = await fetch("/api/docs", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not read local documents");
    }

    const nextDocs = (await response.json()) as DocMeta[];
    setDocs(sortDocs(nextDocs));
    return nextDocs;
  }, []);

  const loadDocument = useCallback(
    async (id: string) => {
      if (!editor) {
        return;
      }

      setSaveState("loading");
      applyingRemoteRef.current = true;
      titleReadyRef.current = false;

      const response = await fetch(`/api/docs/${id}`, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not open document");
      }

      const doc = (await response.json()) as StoredDoc;
      activeIdRef.current = doc.id;
      setActiveId(doc.id);
      setTitle(doc.title);
      editor.commands.setContent(doc.content ?? EMPTY_CONTENT);
      setLastSavedAt(new Date(doc.updatedAt));
      setSaveState("saved");

      window.setTimeout(() => {
        applyingRemoteRef.current = false;
        titleReadyRef.current = true;
        setDocStats(readEditorStats(editor));
        updateScrollProgress();
      }, 100);
    },
    [editor, updateScrollProgress],
  );

  const createDocument = useCallback(
    async (nextTitle = "Untitled") => {
      const response = await fetch("/api/docs", {
        body: JSON.stringify({ title: nextTitle }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Could not create document");
      }

      const doc = (await response.json()) as StoredDoc;
      setDocs((current) => sortDocs([docSummary(doc), ...current]));
      await loadDocument(doc.id);
    },
    [loadDocument],
  );

  const saveNow = useCallback(async () => {
    if (!editor || !activeIdRef.current || applyingRemoteRef.current) {
      return;
    }

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const id = activeIdRef.current;
    const html = editor.getHTML();
    const markdown = toMarkdown(html);
    const content = editor.getJSON();

    setSaveState("saving");

    try {
      const response = await fetch(`/api/docs/${id}`, {
        body: JSON.stringify({
          content,
          html,
          markdown,
          title,
        }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });

      if (!response.ok) {
        throw new Error("Could not save document");
      }

      const saved = (await response.json()) as StoredDoc;
      setDocs((current) => {
        const withoutSaved = current.filter((doc) => doc.id !== saved.id);
        return sortDocs([docSummary(saved), ...withoutSaved]);
      });
      setLastSavedAt(new Date(saved.updatedAt));
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  }, [editor, title, toMarkdown]);

  const scheduleSave = useCallback(() => {
    if (!activeIdRef.current || applyingRemoteRef.current || !titleReadyRef.current) {
      return;
    }

    setSaveState("dirty");

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void saveNow();
    }, 700);
  }, [saveNow]);

  useEffect(() => {
    scheduleSaveRef.current = scheduleSave;
  }, [scheduleSave]);

  useEffect(() => {
    if (!activeId || !editor || !titleReadyRef.current) {
      return;
    }

    scheduleSave();
  }, [activeId, editor, scheduleSave, title]);

  useEffect(() => {
    if (!editor || bootstrappedRef.current) {
      return;
    }

    bootstrappedRef.current = true;

    const boot = async () => {
      try {
        const existing = await refreshDocs();
        if (existing.length > 0) {
          await loadDocument(existing[0].id);
        } else {
          await createDocument("Untitled");
        }
      } catch (error) {
        setBootError(
          error instanceof Error ? error.message : "Could not start Local Docs",
        );
        setSaveState("error");
      }
    };

    void boot();
  }, [createDocument, editor, loadDocument, refreshDocs]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  const filteredDocs = useMemo(() => {
    const value = query.trim().toLowerCase();
    if (!value) {
      return docs;
    }

    return docs.filter((doc) =>
      [doc.title, doc.excerpt, doc.tags.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(value),
    );
  }, [docs, query]);

  const activeDoc = docs.find((doc) => doc.id === activeId) ?? null;

  const closeSidebarOnNarrow = useCallback(() => {
    if (window.matchMedia("(max-width: 900px)").matches) {
      setSidebarOpen(false);
    }
  }, []);

  const createAndMaybeClose = useCallback(() => {
    void createDocument("Untitled").then(closeSidebarOnNarrow);
  }, [closeSidebarOnNarrow, createDocument]);

  const loadAndMaybeClose = useCallback(
    (id: string) => {
      void loadDocument(id).then(closeSidebarOnNarrow);
    },
    [closeSidebarOnNarrow, loadDocument],
  );

  const deleteActive = async () => {
    if (!activeId) {
      return;
    }

    const confirmed = window.confirm("Delete this local document?");
    if (!confirmed) {
      return;
    }

    const response = await fetch(`/api/docs/${activeId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      setSaveState("error");
      return;
    }

    const remaining = docs.filter((doc) => doc.id !== activeId);
    setDocs(remaining);

    if (remaining.length > 0) {
      await loadDocument(remaining[0].id);
    } else {
      await createDocument("Untitled");
    }
  };

  const uploadImage = async (file: File) => {
    if (!activeId || !editor) {
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    const response = await fetch(`/api/docs/${activeId}/assets`, {
      body: formData,
      method: "POST",
    });

    if (!response.ok) {
      setSaveState("error");
      return;
    }

    const asset = (await response.json()) as { url: string };
    editor.chain().focus().setImage({ alt: file.name, src: asset.url }).run();
    scheduleSave();
  };

  const statusLabel = {
    dirty: "Unsaved",
    error: "Error",
    loading: "Loading",
    saved: "Saved",
    saving: "Saving",
  }[saveState];

  return (
    <main
      className={classNames(
        "local-docs-shell",
        sidebarOpen ? "sidebar-is-open" : "sidebar-is-closed",
      )}
    >
      <aside className={classNames("doc-sidebar", !sidebarOpen && "is-closed")}>
        <div className="sidebar-top">
          <div className="brand-mark">
            <BookOpen size={18} />
          </div>
          <div className="brand-copy">
            <strong>Local Docs</strong>
            <span>Mac library</span>
          </div>
          <button
            aria-label={sidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            aria-expanded={sidebarOpen}
            className="icon-button sidebar-toggle"
            onClick={() => setSidebarOpen((value) => !value)}
            title={sidebarOpen ? "Collapse" : "Open"}
            type="button"
          >
            {sidebarOpen ? (
              <PanelLeftClose size={18} />
            ) : (
              <PanelLeftOpen size={18} />
            )}
          </button>
        </div>

        <div className="sidebar-body" aria-hidden={!sidebarOpen}>
          <button
            className="new-doc-button"
            onClick={createAndMaybeClose}
            type="button"
          >
            <FilePlus2 size={17} />
            <span>New Doc</span>
          </button>

          <label className="search-box">
            <Search size={16} />
            <input
              aria-label="Search documents"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Search"
            />
          </label>

          <div className="doc-list" aria-label="Documents">
            {filteredDocs.map((doc) => (
              <button
                className={classNames(
                  "doc-row",
                  doc.id === activeId && "is-active",
                )}
                key={doc.id}
                onClick={() => loadAndMaybeClose(doc.id)}
                type="button"
              >
                <span className="doc-row-title">{doc.title}</span>
                <span className="doc-row-date">{formatDate(doc.updatedAt)}</span>
                {doc.excerpt && (
                  <span className="doc-row-excerpt">{doc.excerpt}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-rail-actions" aria-hidden={sidebarOpen}>
          <button
            aria-label="New document"
            className="rail-button"
            onClick={createAndMaybeClose}
            title="New document"
            type="button"
          >
            <FilePlus2 size={17} />
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <button
          aria-label="Close sidebar"
          className="sidebar-backdrop"
          onClick={() => setSidebarOpen(false)}
          type="button"
        />
      )}

      <section className="workspace">
        <header className="document-header">
          <button
            aria-label="Open sidebar"
            className="icon-button mobile-panel-button"
            onClick={() => setSidebarOpen(true)}
            title="Open sidebar"
            type="button"
          >
            <PanelLeftOpen size={18} />
          </button>
          <div className="title-stack">
            <input
              aria-label="Document title"
              className="title-input"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
            <div className="document-meta">
              <span className={classNames("save-dot", saveState)} />
              <span>{statusLabel}</span>
              {lastSavedAt && <span>{formatDate(lastSavedAt.toISOString())}</span>}
              {activeDoc && <span className="doc-path">{activeDoc.markdownPath}</span>}
            </div>
          </div>

          <div className="header-actions">
            {saveState === "saving" && <Loader2 className="spin" size={18} />}
            <button
              aria-label="Delete document"
              className="icon-button danger"
              disabled={!activeId}
              onClick={() => void deleteActive()}
              title="Delete"
              type="button"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </header>

        <div className="sticky-editor-bars">
          <EditorToolbar
            editor={editor}
            onImage={() => fileInputRef.current?.click()}
            onSave={() => void saveNow()}
          />

          <DocumentUtilityBar
            headings={docStats.headings}
            onJumpToHeading={jumpToHeading}
            onScrollToBottom={() => scrollPaperTo("bottom")}
            onScrollToTop={() => scrollPaperTo("top")}
            progress={scrollProgress}
            stats={docStats}
          />
        </div>

        <input
          ref={fileInputRef}
          accept="image/*"
          className="hidden-input"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = "";
            if (file) {
              void uploadImage(file);
            }
          }}
          type="file"
        />

        <div
          className="paper-wrap"
          onScroll={updateScrollProgress}
          ref={paperWrapRef}
        >
          {bootError ? (
            <div className="boot-error">{bootError}</div>
          ) : (
            <EditorContent editor={editor} />
          )}
        </div>
      </section>
    </main>
  );
}
