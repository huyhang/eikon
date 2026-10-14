import { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import type { ImageTile } from '@eikon/shared';
import { computeJustifiedLayout, findRowOfItem } from '../../core/justifiedLayout';
import { DENSITY_ROW_HEIGHTS } from '../../core/gestures';
import { Scrubber } from './Scrubber';
import { Tile } from './Tile';
import { useDensityGestures } from './useDensityGestures';
import { useElementWidth } from './useElementWidth';
import styles from './JustifiedGrid.module.css';

export interface JustifiedGridHandle {
  /** Scrolls the window so the given image is on screen (used when the viewer moves). */
  revealItem(index: number): void;
}

interface JustifiedGridProps {
  tiles: ImageTile[];
  contextKey: string;
  density: number;
  onOpen: (index: number) => void;
  onDensityStep?: (delta: 1 | -1) => void;
  /** Show only this many rows (no virtualisation, no scrubber) — for compact sections. */
  maxRows?: number;
  gap?: number;
  ref?: Ref<JustifiedGridHandle>;
}

const SCRUBBER_MIN_SCREENS = 3;

export function JustifiedGrid({
  tiles,
  contextKey,
  density,
  onOpen,
  onDensityStep,
  maxRows,
  gap = 3,
  ref,
}: JustifiedGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const width = useElementWidth(containerRef);
  const rowHeight = DENSITY_ROW_HEIGHTS[density] ?? DENSITY_ROW_HEIGHTS[2];
  const layout = useMemo(() => {
    const full = computeJustifiedLayout(
      tiles.map((t) => t.width / Math.max(1, t.height)),
      { containerWidth: width, targetRowHeight: rowHeight, gap },
    );
    if (maxRows === undefined || full.rows.length <= maxRows) return full;
    const rows = full.rows.slice(0, maxRows);
    const last = rows.at(-1)!;
    return { rows, height: last.top + last.height };
  }, [tiles, width, rowHeight, gap, maxRows]);

  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (el) setScrollMargin(el.getBoundingClientRect().top + window.scrollY);
  }, [width, layout.height]);

  const virtualizer = useWindowVirtualizer({
    count: layout.rows.length,
    estimateSize: (i) => (layout.rows[i]?.height ?? rowHeight) + gap,
    overscan: 4,
    scrollMargin,
  });

  useLayoutEffect(() => {
    virtualizer.measure();
  }, [layout, virtualizer]);

  useImperativeHandle(
    ref,
    () => ({
      revealItem(index: number) {
        const row = findRowOfItem(layout, index);
        if (row < 0) return;
        const r = layout.rows[row]!;
        const top = scrollMargin + r.top;
        const viewTop = window.scrollY + 60;
        const viewBottom = window.scrollY + window.innerHeight - 80;
        if (top < viewTop || top + r.height > viewBottom) {
          window.scrollTo({ top: top - (window.innerHeight - r.height) / 2, behavior: 'instant' });
        }
      },
    }),
    [layout, scrollMargin],
  );

  useDensityGestures(containerRef, onDensityStep);

  const items = virtualizer.getVirtualItems();
  const showScrubber = maxRows === undefined && layout.height > window.innerHeight * SCRUBBER_MIN_SCREENS;

  return (
    <div ref={containerRef} className={styles.grid} style={{ height: layout.height }}>
      {items.map((virtualRow) => {
        const row = layout.rows[virtualRow.index];
        if (!row) return null;
        return (
          <div
            key={virtualRow.key}
            className={styles.row}
            style={{ height: row.height, transform: `translateY(${row.top}px)` }}
          >
            {row.items.map((item) => {
              const tile = tiles[item.index]!;
              return (
                <Tile
                  key={tile.id}
                  tile={tile}
                  index={item.index}
                  contextKey={contextKey}
                  onOpen={onOpen}
                  style={{ left: item.left, width: item.width, height: row.height }}
                />
              );
            })}
          </div>
        );
      })}
      {showScrubber && <Scrubber layout={layout} gridTop={scrollMargin} total={tiles.length} />}
    </div>
  );
}
