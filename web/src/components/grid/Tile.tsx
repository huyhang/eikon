import { memo, type CSSProperties } from 'react';
import clsx from 'clsx';
import type { ImageTile } from '@eikon/shared';
import { useLongPress, type PressModifiers } from '../../hooks/useLongPress';
import { Icon } from '../common/Icon';
import { ProgressiveImage } from '../common/ProgressiveImage';
import { tileKey } from './tileKey';
import styles from './Tile.module.css';

interface TileProps {
  tile: ImageTile;
  index: number;
  contextKey: string;
  style: CSSProperties;
  onPress: (index: number, modifiers: PressModifiers) => void;
  /** Long-press (touch) selects; absent where selection isn't offered. */
  onLongPress?: (index: number) => void;
  /** undefined: not in selection mode. */
  selected?: boolean;
}

export const Tile = memo(function Tile({
  tile,
  index,
  contextKey,
  style,
  onPress,
  onLongPress,
  selected,
}: TileProps) {
  const handlers = useLongPress(
    (modifiers) => onPress(index, modifiers),
    onLongPress ? () => onLongPress(index) : undefined,
  );
  const selecting = selected !== undefined;
  return (
    <button
      type="button"
      className={clsx(styles.tile, selecting && styles.selecting, selected && styles.selected)}
      style={style}
      data-tile-key={tileKey(contextKey, tile.id)}
      aria-label={selecting ? `Image ${index + 1}` : `Open image ${index + 1}`}
      aria-pressed={selecting ? selected : undefined}
      {...handlers}
    >
      <ProgressiveImage tile={tile} />
      {selecting && (
        <span className={styles.check} aria-hidden="true">
          {selected && <Icon name="check" size={14} strokeWidth={3} />}
        </span>
      )}
    </button>
  );
});
