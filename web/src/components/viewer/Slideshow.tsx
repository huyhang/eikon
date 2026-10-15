import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { AnimatePresence, motion } from 'motion/react';
import { thumbUrl, type ImageTile } from '@eikon/shared';
import { useDependencies } from '../../context/Dependencies';
import { usePrefs } from '../../context/Prefs';
import { SLIDESHOW_SECONDS, slideOrder, stepPosition, type SlideshowSeconds } from '../../core/slideshow';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useWakeLock } from '../../hooks/useWakeLock';
import { Segmented, Switch } from '../common/Controls';
import { Icon } from '../common/Icon';
import styles from './Slideshow.module.css';

const CONTROLS_MS = 3000;
const SECONDS_OPTIONS = SLIDESHOW_SECONDS.map((s) => ({ value: String(s), label: `${s}s` }));

interface SlideshowProps {
  tiles: ImageTile[];
  startIndex: number;
  /** Leaves the slideshow, reporting which picture was showing. */
  onExit: (index: number) => void;
}

/** Picture-frame mode: full screen, cross-fading through the grid, screen kept awake. */
export function Slideshow({ tiles, startIndex, onExit }: SlideshowProps) {
  const { slideshow, setSlideshow } = usePrefs();
  const { random } = useDependencies();
  const [order, setOrder] = useState(() => slideOrder(tiles.length, startIndex, slideshow.shuffle, random));
  const [position, setPosition] = useState(0);
  const [paused, setPaused] = useState(false);
  const [controls, setControls] = useState(true);
  const index = order[position] ?? 0;
  const tile = tiles[index];
  const awake = useWakeLock(!paused);
  useBodyScrollLock(true);

  const step = useCallback(
    (direction: 1 | -1) => setPosition((p) => stepPosition(p, order.length, direction)),
    [order.length],
  );
  const exit = useCallback(() => onExit(index), [onExit, index]);

  useEffect(() => {
    if (paused) return;
    const timer = window.setTimeout(
      () => setPosition(stepPosition(position, order.length, 1)),
      slideshow.seconds * 1000,
    );
    return () => window.clearTimeout(timer);
  }, [position, order.length, paused, slideshow.seconds]);

  useEffect(() => {
    const next = tiles[order[stepPosition(position, order.length, 1)] ?? 0];
    if (next) new Image().src = thumbUrl(next, 'lg');
  }, [position, order, tiles]);

  // Controls fade after a few seconds, but stay while paused so the settings can be changed.
  useEffect(() => {
    if (!controls || paused) return;
    const timer = window.setTimeout(() => setControls(false), CONTROLS_MS);
    return () => window.clearTimeout(timer);
  }, [controls, paused]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exit();
      else if (e.key === ' ') setPaused((p) => !p);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [exit, step]);

  const setShuffle = (shuffle: boolean) => {
    setSlideshow({ shuffle });
    setOrder(slideOrder(tiles.length, index, shuffle, random));
    setPosition(0);
  };

  if (!tile) return null;
  return createPortal(
    <div
      className={clsx(styles.show, !controls && styles.idle)}
      role="dialog"
      aria-modal="true"
      aria-label="Slideshow"
      onClick={() => setControls((c) => !c)}
    >
      <AnimatePresence initial={false}>
        <motion.img
          key={tile.id}
          className={styles.picture}
          src={thumbUrl(tile, 'lg')}
          alt={`Slide ${position + 1} of ${order.length}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.9 }}
          draggable={false}
        />
      </AnimatePresence>
      {controls && (
        <div className={styles.controls} onClick={(e) => e.stopPropagation()}>
          <button type="button" className={styles.round} onClick={exit} aria-label="Exit slideshow">
            <Icon name="close" size={18} strokeWidth={2.2} />
          </button>
          <button
            type="button"
            className={styles.round}
            onClick={() => setPaused(!paused)}
            aria-label={paused ? 'Play' : 'Pause'}
          >
            <Icon name={paused ? 'play' : 'pause'} size={18} strokeWidth={2.4} />
          </button>
          <Segmented
            label="Seconds per picture"
            value={String(slideshow.seconds)}
            options={SECONDS_OPTIONS}
            onChange={(v) => setSlideshow({ seconds: Number(v) as SlideshowSeconds })}
          />
          <span className={styles.shuffle}>
            <Icon name="shuffle" size={16} />
            <Switch label="Shuffle" checked={slideshow.shuffle} onChange={setShuffle} />
          </span>
          <span className={styles.position}>
            {position + 1} / {order.length}
            {!awake && ' · screen may sleep'}
          </span>
        </div>
      )}
    </div>,
    document.body,
  );
}
