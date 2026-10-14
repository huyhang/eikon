import { useCallback, useState } from 'react';
import clsx from 'clsx';
import { thumbUrl, type ImageTile, type ThumbSize } from '@eikon/shared';
import { placeholderAverageColor, placeholderToDataUrl } from '../../core/placeholder';
import styles from './ProgressiveImage.module.css';

interface ProgressiveImageProps {
  tile: ImageTile;
  size?: ThumbSize;
  fit?: 'cover' | 'contain';
  eager?: boolean;
  className?: string;
  alt?: string;
}

/** Blurred colour placeholder that cross-fades into the real thumbnail once it has loaded. */
export function ProgressiveImage({
  tile,
  size = 'sm',
  fit = 'cover',
  eager,
  className,
  alt = '',
}: ProgressiveImageProps) {
  const [loaded, setLoaded] = useState(false);
  const placeholder = placeholderToDataUrl(tile.placeholder);
  const markIfComplete = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete && img.naturalWidth > 0) setLoaded(true);
  }, []);

  return (
    <div
      className={clsx(styles.frame, className)}
      style={{ backgroundColor: placeholderAverageColor(tile.placeholder) }}
      data-fit={fit}
    >
      {placeholder && <img className={styles.placeholder} src={placeholder} alt="" aria-hidden="true" />}
      <img
        ref={markIfComplete}
        className={clsx(styles.image, loaded && styles.loaded)}
        src={thumbUrl(tile.id, size)}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        draggable={false}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}
