import { useImperativeHandle, type Ref } from 'react';
import type { ImageTile } from '@eikon/shared';
import { ProgressiveImage } from '../common/ProgressiveImage';
import { findTileElement, tileKey } from './tileKey';
import type { JustifiedGridHandle } from './JustifiedGrid';
import styles from './ImageStrip.module.css';

interface ImageStripProps {
  tiles: ImageTile[];
  contextKey: string;
  onOpen: (index: number) => void;
  ref?: Ref<JustifiedGridHandle>;
}

/** Large, horizontally scrolling carousel of images at their natural aspect ratio. */
export function ImageStrip({ tiles, contextKey, onOpen, ref }: ImageStripProps) {
  useImperativeHandle(
    ref,
    () => ({
      revealItem(index: number) {
        const tile = tiles[index];
        if (tile)
          findTileElement(contextKey, tile.id)?.scrollIntoView({ inline: 'center', block: 'nearest' });
      },
    }),
    [tiles, contextKey],
  );

  return (
    <div className={styles.strip}>
      {tiles.map((tile, index) => (
        <button
          key={tile.id}
          type="button"
          className={styles.item}
          style={{ aspectRatio: `${Math.min(2.2, Math.max(0.55, tile.width / Math.max(1, tile.height)))}` }}
          data-tile-key={tileKey(contextKey, tile.id)}
          onClick={() => onOpen(index)}
          aria-label={`Open recent image ${index + 1}`}
        >
          <ProgressiveImage tile={tile} eager={index < 4} />
        </button>
      ))}
    </div>
  );
}
