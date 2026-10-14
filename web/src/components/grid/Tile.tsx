import { memo, type CSSProperties } from 'react';
import type { ImageTile } from '@eikon/shared';
import { ProgressiveImage } from '../common/ProgressiveImage';
import { tileKey } from './tileKey';
import styles from './Tile.module.css';

interface TileProps {
  tile: ImageTile;
  index: number;
  contextKey: string;
  style: CSSProperties;
  onOpen: (index: number) => void;
}

export const Tile = memo(function Tile({ tile, index, contextKey, style, onOpen }: TileProps) {
  return (
    <button
      type="button"
      className={styles.tile}
      style={style}
      data-tile-key={tileKey(contextKey, tile.id)}
      onClick={() => onOpen(index)}
      aria-label={`Open image ${index + 1}`}
    >
      <ProgressiveImage tile={tile} />
    </button>
  );
});
