export interface LayoutItem {
  index: number;
  left: number;
  width: number;
}

export interface LayoutRow {
  top: number;
  height: number;
  items: LayoutItem[];
}

export interface JustifiedLayout {
  rows: LayoutRow[];
  height: number;
}

export interface LayoutOptions {
  containerWidth: number;
  targetRowHeight: number;
  gap: number;
  /** Extreme panoramas/strips are clamped so a single image never dominates a row. */
  minAspect?: number;
  maxAspect?: number;
}

const DEFAULT_MIN_ASPECT = 0.3;
const DEFAULT_MAX_ASPECT = 3.5;

export function clampAspect(aspect: number, min = DEFAULT_MIN_ASPECT, max = DEFAULT_MAX_ASPECT): number {
  if (!Number.isFinite(aspect) || aspect <= 0) return 1;
  return Math.min(max, Math.max(min, aspect));
}

function rowWidthAt(height: number, aspects: number[], gap: number): number {
  const sum = aspects.reduce((a, b) => a + b, 0);
  return sum * height + gap * (aspects.length - 1);
}

function heightToFill(width: number, aspects: number[], gap: number): number {
  const sum = aspects.reduce((a, b) => a + b, 0);
  return (width - gap * (aspects.length - 1)) / sum;
}

function placeRow(indexes: number[], aspects: number[], top: number, height: number, gap: number): LayoutRow {
  let left = 0;
  const items = indexes.map((index, i) => {
    const width = (aspects[i] ?? 1) * height;
    const item = { index, left, width };
    left += width + gap;
    return item;
  });
  return { top, height, items };
}

/**
 * Greedy justified ("Apple Photos aspect") layout: images keep their aspect ratio and
 * each full row is scaled to exactly fill the container width. The last row keeps the
 * target height and stays left-aligned.
 */
export function computeJustifiedLayout(
  rawAspects: readonly number[],
  options: LayoutOptions,
): JustifiedLayout {
  const { containerWidth, targetRowHeight, gap } = options;
  const rows: LayoutRow[] = [];
  if (containerWidth <= 0 || rawAspects.length === 0) return { rows, height: 0 };

  let top = 0;
  let pending: number[] = [];
  let pendingAspects: number[] = [];

  rawAspects.forEach((raw, index) => {
    pending.push(index);
    pendingAspects.push(clampAspect(raw, options.minAspect, options.maxAspect));
    if (rowWidthAt(targetRowHeight, pendingAspects, gap) >= containerWidth) {
      const height = heightToFill(containerWidth, pendingAspects, gap);
      rows.push(placeRow(pending, pendingAspects, top, height, gap));
      top += height + gap;
      pending = [];
      pendingAspects = [];
    }
  });

  if (pending.length > 0) {
    rows.push(placeRow(pending, pendingAspects, top, targetRowHeight, gap));
    top += targetRowHeight + gap;
  }
  return { rows, height: Math.max(0, top - gap) };
}

/** Index of the row containing the given image, or -1. */
export function findRowOfItem(layout: JustifiedLayout, itemIndex: number): number {
  let lo = 0;
  let hi = layout.rows.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const row = layout.rows[mid]!;
    const first = row.items[0]!.index;
    const last = row.items[row.items.length - 1]!.index;
    if (itemIndex < first) hi = mid - 1;
    else if (itemIndex > last) lo = mid + 1;
    else return mid;
  }
  return -1;
}
