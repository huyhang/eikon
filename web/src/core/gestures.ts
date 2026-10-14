export type SwipeOutcome = 'next' | 'prev' | 'close' | 'info' | 'none';
export type SwipeAxis = 'x' | 'y' | null;

export interface SwipeInput {
  axis: SwipeAxis;
  dx: number;
  dy: number;
  /** Velocity in px/ms along the locked axis. */
  velocity: number;
  viewportWidth: number;
  viewportHeight: number;
  hasPrev: boolean;
  hasNext: boolean;
}

const FLICK_VELOCITY = 0.5;

/** Decides what a finished one-finger swipe in the viewer should do. */
export function resolveSwipe(input: SwipeInput): SwipeOutcome {
  const { axis, dx, dy, velocity, viewportWidth, viewportHeight } = input;
  if (axis === 'x') {
    const far = Math.abs(dx) > viewportWidth * 0.22;
    const flick = Math.abs(velocity) > FLICK_VELOCITY && Math.abs(dx) > 20;
    if (!far && !flick) return 'none';
    if (dx < 0 && input.hasNext) return 'next';
    if (dx > 0 && input.hasPrev) return 'prev';
    return 'none';
  }
  if (axis === 'y') {
    const flick = Math.abs(velocity) > FLICK_VELOCITY;
    if (dy > viewportHeight * 0.15 || (flick && dy > 30)) return 'close';
    if (dy < -viewportHeight * 0.1 || (flick && dy < -30)) return 'info';
  }
  return 'none';
}

/** Locks a drag to an axis once it moved far enough. */
export function lockAxis(dx: number, dy: number, threshold = 8): SwipeAxis {
  if (Math.hypot(dx, dy) < threshold) return null;
  return Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
}

export const DENSITY_ROW_HEIGHTS = [96, 140, 190, 250, 340, 460] as const;

export function clampDensity(level: number): number {
  return Math.min(DENSITY_ROW_HEIGHTS.length - 1, Math.max(0, Math.round(level)));
}

export function defaultDensity(viewportWidth: number): number {
  if (viewportWidth < 600) return 1;
  if (viewportWidth < 1100) return 2;
  return 3;
}

/** Pinch scale → density step: spreading fingers makes images bigger. */
export function densityStepForPinch(scale: number): -1 | 0 | 1 {
  if (scale > 1.25) return 1;
  if (scale < 0.8) return -1;
  return 0;
}
