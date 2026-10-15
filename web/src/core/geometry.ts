export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Largest rect of the given aspect ratio centred inside the container ("object-fit: contain"). */
export function fitRect(container: Rect, aspect: number, padding = 0): Rect {
  const availW = Math.max(0, container.width - padding * 2);
  const availH = Math.max(0, container.height - padding * 2);
  const safeAspect = aspect > 0 && Number.isFinite(aspect) ? aspect : 1;
  let width = availW;
  let height = width / safeAspect;
  if (height > availH) {
    height = availH;
    width = height * safeAspect;
  }
  return {
    x: container.x + (container.width - width) / 2,
    y: container.y + (container.height - height) / 2,
    width,
    height,
  };
}

/** Width an image of `aspect` is drawn at in a box with "object-fit: cover" or "contain". */
export function fittedWidth(
  box: { width: number; height: number },
  aspect: number,
  fit: 'cover' | 'contain',
): number {
  const atBoxHeight = box.height * aspect;
  return fit === 'cover' ? Math.max(box.width, atBoxHeight) : Math.min(box.width, atBoxHeight);
}

/**
 * Transform (translate + uniform scale, origin at the stage centre) that makes an image box
 * shown inside `stage` appear exactly over `target` (e.g. its grid thumbnail).
 */
export function flipToTarget(target: Rect, box: Rect, stage: Rect): { x: number; y: number; scale: number } {
  if (box.width === 0) return { x: 0, y: 0, scale: 1 };
  const scale = target.width / box.width;
  const cx = stage.x + stage.width / 2;
  const cy = stage.y + stage.height / 2;
  const bx = box.x + box.width / 2;
  const by = box.y + box.height / 2;
  return {
    x: target.x + target.width / 2 - cx - (bx - cx) * scale,
    y: target.y + target.height / 2 - cy - (by - cy) * scale,
    scale,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Maps a pointer position on a scrubber track to a scroll offset. */
export function scrubberToScroll(
  pointerY: number,
  trackTop: number,
  trackHeight: number,
  scrollRange: number,
): number {
  if (trackHeight <= 0) return 0;
  return clamp((pointerY - trackTop) / trackHeight, 0, 1) * Math.max(0, scrollRange);
}

/** Fraction (0..1) of the scroll range already scrolled. */
export function scrollFraction(scrollTop: number, scrollRange: number): number {
  return scrollRange <= 0 ? 0 : clamp(scrollTop / scrollRange, 0, 1);
}
