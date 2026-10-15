import { useCallback, useRef, useState } from 'react';
import clsx from 'clsx';
import { thumbSrcSet, thumbUrl, type ImageTile } from '@eikon/shared';
import { fittedWidth } from '../../core/geometry';
import { placeholderAverageColor, placeholderToDataUrl } from '../../core/placeholder';
import { useElementSize } from '../../hooks/useElementSize';
import styles from './ProgressiveImage.module.css';

interface ProgressiveImageProps {
  tile: ImageTile;
  fit?: 'cover' | 'contain';
  eager?: boolean;
  className?: string;
  alt?: string;
}

/**
 * Blurred colour placeholder that cross-fades into the real thumbnail once it has loaded. The browser
 * picks the thumbnail size from the width the image is drawn at and the screen's pixel density.
 */
export function ProgressiveImage({ tile, fit = 'cover', eager, className, alt = '' }: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const box = useElementSize(frameRef);
  const drawnWidth = Math.ceil(fittedWidth(box, tile.width / Math.max(1, tile.height), fit));
  const placeholder = placeholderToDataUrl(tile.placeholder);
  const markIfComplete = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <div
      ref={frameRef}
      className={clsx(styles.frame, className)}
      style={{ backgroundColor: placeholderAverageColor(tile.placeholder) }}
      data-fit={fit}
    >
      {placeholder && <img className={styles.placeholder} src={placeholder} alt="" aria-hidden="true" />}
      <img
        ref={markIfComplete}
        className={clsx(styles.image, loaded && styles.loaded)}
        src={thumbUrl(tile, 'sm')}
        // Without a measured width the browser would size the srcset to the whole viewport.
        srcSet={drawnWidth > 0 ? thumbSrcSet(tile) : undefined}
        sizes={drawnWidth > 0 ? `${drawnWidth}px` : undefined}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
