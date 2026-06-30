import { Extension } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export type PaginationMetrics = {
  gap: number;
  height: number;
  marginBottom: number;
  marginLeft: number;
  marginRight: number;
  marginTop: number;
  width: number;
};

type PageBreak = {
  height: number;
  page: number;
  position: number;
};

type PaginationState = {
  breaks: PageBreak[];
  decorations: DecorationSet;
  pageCount: number;
};

type PaginationMeta = Pick<PaginationState, "breaks" | "pageCount">;

type PaginationOptions = {
  getMetrics: () => PaginationMetrics;
  onPageCountChange: (pageCount: number) => void;
};

export const PAGINATION_REFLOW_EVENT = "local-docs-pagination-reflow";

const paginationKey = new PluginKey<PaginationState>("localDocsPagination");

function createDecorations(doc: ProseMirrorNode, breaks: PageBreak[]) {
  return DecorationSet.create(
    doc,
    breaks.map((pageBreak) =>
      Decoration.widget(
        pageBreak.position,
        () => {
          const element = document.createElement("div");
          element.className = "page-break-gap";
          element.contentEditable = "false";
          element.dataset.page = String(pageBreak.page);
          element.style.height = `${pageBreak.height}px`;
          element.setAttribute("aria-hidden", "true");
          return element;
        },
        {
          key: `page-break-${pageBreak.position}-${Math.round(pageBreak.height)}`,
          side: -1,
        },
      ),
    ),
  );
}

function layoutsMatch(current: PaginationState, next: PaginationMeta) {
  if (
    current.pageCount !== next.pageCount ||
    current.breaks.length !== next.breaks.length
  ) {
    return false;
  }

  return current.breaks.every((pageBreak, index) => {
    const candidate = next.breaks[index];
    return (
      pageBreak.position === candidate.position &&
      Math.abs(pageBreak.height - candidate.height) < 1
    );
  });
}

function measurePagination(
  view: EditorView,
  current: PaginationState,
  metrics: PaginationMetrics,
): PaginationMeta {
  const pageStride = metrics.height + metrics.gap;
  const contentHeight = metrics.height - metrics.marginTop - metrics.marginBottom;
  const editorRect = view.dom.getBoundingClientRect();
  const scale = view.dom.offsetWidth
    ? editorRect.width / view.dom.offsetWidth
    : 1;
  const previousBreaks = [...current.breaks].sort(
    (a, b) => a.position - b.position,
  );
  const nextBreaks: PageBreak[] = [];
  let previousGapHeight = 0;
  let nextGapHeight = 0;
  let previousBreakIndex = 0;
  let greatestBottom = metrics.marginTop;

  view.state.doc.forEach((_node, position) => {
    const nodeDom = view.nodeDOM(position);
    if (!(nodeDom instanceof HTMLElement)) {
      return;
    }

    while (
      previousBreakIndex < previousBreaks.length &&
      previousBreaks[previousBreakIndex].position <= position
    ) {
      previousGapHeight += previousBreaks[previousBreakIndex].height;
      previousBreakIndex += 1;
    }

    const rect = nodeDom.getBoundingClientRect();
    const styles = window.getComputedStyle(nodeDom);
    const marginBottom = Number.parseFloat(styles.marginBottom) || 0;
    const naturalTop =
      (rect.top - editorRect.top) / Math.max(scale, 0.01) - previousGapHeight;
    const blockHeight = rect.height / Math.max(scale, 0.01) + marginBottom;
    let blockTop = naturalTop + nextGapHeight;
    let blockBottom = blockTop + blockHeight;
    let pageIndex = Math.max(0, Math.floor(blockTop / pageStride));
    let contentStart = pageIndex * pageStride + metrics.marginTop;
    let contentEnd = pageIndex * pageStride + metrics.height - metrics.marginBottom;

    if (blockTop < contentStart) {
      const alignmentGap = contentStart - blockTop;
      nextGapHeight += alignmentGap;
      blockTop = contentStart;
      blockBottom += alignmentGap;
    }

    const startsPastPage = blockTop >= contentEnd - 1;
    const crossesPage = blockBottom > contentEnd + 1;
    const canFitOnPage = blockHeight <= contentHeight;
    const shouldMove =
      startsPastPage ||
      (crossesPage && (canFitOnPage || blockTop > contentStart + 4));

    if (shouldMove) {
      pageIndex += 1;
      contentStart = pageIndex * pageStride + metrics.marginTop;
      contentEnd = pageIndex * pageStride + metrics.height - metrics.marginBottom;
      const breakHeight = Math.max(0, contentStart - blockTop);

      if (breakHeight > 0.5) {
        nextBreaks.push({
          height: breakHeight,
          page: pageIndex + 1,
          position,
        });
        nextGapHeight += breakHeight;
        blockTop += breakHeight;
        blockBottom += breakHeight;
      }
    }

    greatestBottom = Math.max(greatestBottom, blockBottom, contentEnd - 1);
  });

  const pageCount = Math.max(
    1,
    Math.floor(Math.max(greatestBottom - 1, 0) / pageStride) + 1,
  );

  return { breaks: nextBreaks, pageCount };
}

export const Pagination = Extension.create<PaginationOptions>({
  name: "localDocsPagination",

  addOptions() {
    return {
      getMetrics: () => ({
        gap: 24,
        height: 1056,
        marginBottom: 96,
        marginLeft: 96,
        marginRight: 96,
        marginTop: 96,
        width: 816,
      }),
      onPageCountChange: () => undefined,
    };
  },

  addProseMirrorPlugins() {
    const options = this.options;

    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init(_, state) {
            return {
              breaks: [],
              decorations: DecorationSet.create(state.doc, []),
              pageCount: 1,
            };
          },
          apply(transaction, current, _oldState, nextState) {
            const meta = transaction.getMeta(paginationKey) as
              | PaginationMeta
              | undefined;

            if (meta) {
              return {
                ...meta,
                decorations: createDecorations(nextState.doc, meta.breaks),
              };
            }

            const breaks = current.breaks.map((pageBreak) => ({
              ...pageBreak,
              position: transaction.mapping.map(pageBreak.position, -1),
            }));

            return {
              breaks,
              decorations: current.decorations.map(
                transaction.mapping,
                nextState.doc,
              ),
              pageCount: current.pageCount,
            };
          },
        },
        props: {
          decorations(state) {
            return paginationKey.getState(state)?.decorations ?? null;
          },
        },
        view(initialView) {
          let activeView = initialView;
          let animationFrame: number | null = null;

          const measure = () => {
            animationFrame = null;
            const current = paginationKey.getState(activeView.state);
            if (!current) {
              return;
            }

            const next = measurePagination(
              activeView,
              current,
              options.getMetrics(),
            );

            if (layoutsMatch(current, next)) {
              return;
            }

            activeView.dispatch(
              activeView.state.tr
                .setMeta(paginationKey, next)
                .setMeta("addToHistory", false),
            );

            if (current.pageCount !== next.pageCount) {
              options.onPageCountChange(next.pageCount);
            }
          };

          const scheduleMeasure = () => {
            if (animationFrame !== null) {
              window.cancelAnimationFrame(animationFrame);
            }
            animationFrame = window.requestAnimationFrame(measure);
          };

          const resizeObserver = new ResizeObserver(scheduleMeasure);
          resizeObserver.observe(activeView.dom);
          window.addEventListener("resize", scheduleMeasure);
          window.addEventListener(PAGINATION_REFLOW_EVENT, scheduleMeasure);
          scheduleMeasure();

          return {
            update(nextView, previousState) {
              activeView = nextView;
              if (!nextView.state.doc.eq(previousState.doc)) {
                scheduleMeasure();
              }
            },
            destroy() {
              if (animationFrame !== null) {
                window.cancelAnimationFrame(animationFrame);
              }
              resizeObserver.disconnect();
              window.removeEventListener("resize", scheduleMeasure);
              window.removeEventListener(
                PAGINATION_REFLOW_EVENT,
                scheduleMeasure,
              );
            },
          };
        },
      }),
    ];
  },
});
