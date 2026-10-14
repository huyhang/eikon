import { useState } from 'react';
import clsx from 'clsx';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { originalUrl, thumbUrl, type ImageTile } from '@eikon/shared';
import { fitRect, type Rect } from '../../core/geometry';
import styles from './Viewer.module.css';

interface ViewerImageProps {
  tile: ImageTile;
  stage: { width: number; height: number };
  padding: number;
  /** Only the current slide is zoomable. */
  active: boolean;
  /** Animated originals are shown directly since thumbnails are a still frame. */
  animated: boolean;
  onZoomChange?: (zoomed: boolean) => void;
}

export function boxFor(tile: ImageTile, stage: { width: number; height: number }, padding: number): Rect {
  return fitRect(
    { x: 0, y: 0, width: stage.width, height: stage.height },
    tile.width / Math.max(1, tile.height),
    padding,
  );
}

/** Thumbnail → large → original, each layer fading in over the previous one once loaded. */
function ImageLayers({ tile, box, hiRes }: { tile: ImageTile; box: Rect; hiRes: boolean }) {
  const [largeLoaded, setLargeLoaded] = useState(false);
  const [originalLoaded, setOriginalLoaded] = useState(false);
  return (
    <div className={styles.box} style={{ left: box.x, top: box.y, width: box.width, height: box.height }}>
      <img className={styles.layer} src={thumbUrl(tile.id, 'sm')} alt="" draggable={false} />
      <img
        className={clsx(styles.layer, styles.fade, largeLoaded && styles.shown)}
        src={thumbUrl(tile.id, 'lg')}
        alt=""
        draggable={false}
        onLoad={() => setLargeLoaded(true)}
      />
      {hiRes && (
        <img
          className={clsx(styles.layer, styles.fade, originalLoaded && styles.shown)}
          src={originalUrl(tile.id)}
          alt=""
          draggable={false}
          onLoad={() => setOriginalLoaded(true)}
        />
      )}
    </div>
  );
}

export function ViewerImage({ tile, stage, padding, active, animated, onZoomChange }: ViewerImageProps) {
  const [zoomed, setZoomed] = useState(false);
  const [hiRes, setHiRes] = useState(false);
  const box = boxFor(tile, stage, padding);
  const layers = <ImageLayers tile={tile} box={box} hiRes={hiRes || (active && animated)} />;

  if (!active) return <div className={styles.slideFill}>{layers}</div>;

  return (
    <TransformWrapper
      minScale={1}
      maxScale={8}
      limitToBounds
      doubleClick={{ mode: 'toggle', step: 1.6, animationTime: 260 }}
      panning={{ disabled: !zoomed, velocityDisabled: false }}
      wheel={{ step: 0.12 }}
      onTransform={(_ref, state) => {
        const isZoomed = state.scale > 1.01;
        if (isZoomed !== zoomed) {
          setZoomed(isZoomed);
          onZoomChange?.(isZoomed);
        }
        if (state.scale > 1.2 && !hiRes) setHiRes(true);
      }}
    >
      <TransformComponent
        wrapperStyle={{ width: '100%', height: '100%' }}
        contentStyle={{ width: stage.width, height: stage.height }}
      >
        {layers}
      </TransformComponent>
    </TransformWrapper>
  );
}
