import clsx from 'clsx';
import { thumbUrl, type ImageTile } from '@eikon/shared';
import styles from './Filmstrip.module.css';

/** How many neighbours on each side the strip shows; enough to browse, few enough to stay light. */
export const FILMSTRIP_REACH = 20;

/** Keeps the current thumbnail centred: React calls it whenever the ref moves to a new button. */
function centre(button: HTMLButtonElement | null) {
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  button?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: still ? 'auto' : 'smooth' });
}

/** The slice of tiles the strip renders around the current index. */
export function filmstripWindow(
  count: number,
  index: number,
  reach = FILMSTRIP_REACH,
): { start: number; end: number } {
  const start = Math.max(0, index - reach);
  return { start, end: Math.min(count, index + reach + 1) };
}

interface FilmstripProps {
  tiles: ImageTile[];
  index: number;
  onJump: (index: number) => void;
  /** Space between the strip and the bottom of the stage (the toolbar sits there). */
  bottom: number;
}

/** Thumbnails of the neighbouring pictures; tap one to jump straight to it. */
export function Filmstrip({ tiles, index, onJump, bottom }: FilmstripProps) {
  const { start, end } = filmstripWindow(tiles.length, index);
  return (
    <nav className={styles.strip} style={{ bottom }} aria-label="Nearby images" data-no-swipe>
      {tiles.slice(start, end).map((tile, offset) => {
        const i = start + offset;
        const aspect = tile.width / Math.max(1, tile.height);
        return (
          <button
            key={tile.id}
            ref={i === index ? centre : undefined}
            type="button"
            className={clsx(styles.thumb, i === index && styles.current)}
            style={{ width: Math.round(40 * Math.min(2, Math.max(0.6, aspect))) }}
            onClick={() => onJump(i)}
            aria-label={`Image ${i + 1}`}
            aria-current={i === index}
          >
            <img src={thumbUrl(tile, 'sm')} alt="" loading="lazy" draggable={false} />
          </button>
        );
      })}
    </nav>
  );
}
