import { useEffect, useRef, useState, type PointerEvent } from 'react';
import clsx from 'clsx';
import { findRowOfItem, type JustifiedLayout } from '../../core/justifiedLayout';
import { formatCount } from '../../core/format';
import { scrollFraction, scrubberToScroll } from '../../core/geometry';
import styles from './Scrubber.module.css';

interface ScrubberProps {
  layout: JustifiedLayout;
  gridTop: number;
  total: number;
}

const IDLE_MS = 1400;
const TRACK_INSET_TOP = 80;
const TRACK_INSET_BOTTOM = 100;

/** First image index visible at a given offset inside the grid. */
function indexAtOffset(layout: JustifiedLayout, offset: number): number {
  const row = layout.rows.find((r) => r.top + r.height >= offset) ?? layout.rows.at(-1);
  return row?.items[0]?.index ?? 0;
}

/** Fast-scroll handle on the right edge, Photos-style. Appears while scrolling. */
export function Scrubber({ layout, gridTop, total }: ScrubberProps) {
  const [fraction, setFraction] = useState(0);
  const [visible, setVisible] = useState(false);
  const [dragging, setDragging] = useState(false);
  const idleTimer = useRef<number | undefined>(undefined);
  const trackRef = useRef<HTMLDivElement>(null);
  const range = Math.max(0, layout.height - window.innerHeight);

  useEffect(() => {
    const onScroll = () => {
      setFraction(scrollFraction(window.scrollY - gridTop, range));
      setVisible(true);
      window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => setVisible(false), IDLE_MS);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.clearTimeout(idleTimer.current);
    };
  }, [gridTop, range]);

  const scrollToPointer = (clientY: number) => {
    const track = trackRef.current?.getBoundingClientRect();
    if (!track) return;
    window.scrollTo({
      top: gridTop + scrubberToScroll(clientY, track.top, track.height, range),
      behavior: 'instant',
    });
  };

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setDragging(true);
    scrollToPointer(e.clientY);
  };
  const onPointerMove = (e: PointerEvent) => dragging && scrollToPointer(e.clientY);
  const onPointerUp = () => setDragging(false);

  const position = indexAtOffset(layout, fraction * range + window.innerHeight / 3) + 1;
  const row = findRowOfItem(layout, position - 1);

  return (
    <div
      ref={trackRef}
      className={clsx(styles.track, (visible || dragging) && styles.visible)}
      style={{ top: TRACK_INSET_TOP, bottom: TRACK_INSET_BOTTOM }}
    >
      <div
        className={clsx(styles.handle, dragging && styles.dragging)}
        style={{ top: `${fraction * 100}%` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="scrollbar"
        aria-controls="grid"
        aria-valuenow={Math.round(fraction * 100)}
        aria-label="Scroll through images"
        data-row={row}
      >
        {dragging && (
          <span className={styles.label}>
            {formatCount(position)} / {formatCount(total)}
          </span>
        )}
      </div>
    </div>
  );
}
