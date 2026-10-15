import { useState } from 'react';
import clsx from 'clsx';
import { TransformComponent, TransformWrapper } from 'react-zoom-pan-pinch';
import { originalUrl, thumbUrl, type ImageTile } from '@eikon/shared';
import type { Rect } from '../../core/geometry';
import { pictureArea, pictureBox, type Insets } from '../../core/viewerLayout';
import styles from './Viewer.module.css';

interface ViewerImageProps {
  tile: ImageTile;
  stage: { width: number; height: number };
  insets: Insets;
  padding: number;
  /** Describes the picture for screen readers (empty for neighbouring slides). */
  alt: string;
  /** Only the current slide is zoomable. */
  active: boolean;
  /** Animated originals are shown directly since thumbnails are a still frame. */
  animated: boolean;
  onZoomChange?: (zoomed: boolean) => void;
}

export function boxFor(
  tile: ImageTile,
  stage: { width: number; height: number },
  insets: Insets,
  padding: number,
): Rect {
  return pictureBox(tile.width / Math.max(1, tile.height), stage, insets, padding);
}

/** Thumbnail → large → original, each layer fading in over the previous one once loaded. */
function ImageLayers({ tile, box, hiRes, alt }: { tile: ImageTile; box: Rect; hiRes: boolean; alt: string }) {
  const [largeLoaded, setLargeLoaded] = useState(false);
  const [originalLoaded, setOriginalLoaded] = useState(false);
  return (
    <div className={styles.box} style={{ left: box.x, top: box.y, width: box.width, height: box.height }}>
      <img className={styles.layer} src={thumbUrl(tile, 'sm')} alt={alt} draggable={false} />
      <img
        className={clsx(styles.layer, styles.fade, largeLoaded && styles.shown)}
        src={thumbUrl(tile, 'lg')}
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

export function ViewerImage({
  tile,
  stage,
  insets,
  padding,
  alt,
  active,
  animated,
  onZoomChange,
}: ViewerImageProps) {
  const [zoomed, setZoomed] = useState(false);
  const [hiRes, setHiRes] = useState(false);
  const box = boxFor(tile, stage, insets, padding);
  const showOriginal = hiRes || (active && animated);

  if (!active)
    return (
      <div className={styles.slideFill}>
        <ImageLayers tile={tile} box={box} hiRes={showOriginal} alt={alt} />
      </div>
    );

  // What zooms is the picture itself, inside the area between the bars, so a zoomed picture pans only
  // until its edges meet the area's (never into the black around it), and stays centred in a direction
  // it doesn't yet fill. It still draws beyond the area, under the bars, as the stage clips it.
  const area = pictureArea(stage, insets);
  return (
    <TransformWrapper
      minScale={1}
      maxScale={8}
      limitToBounds
      centerZoomedOut
      initialPositionX={box.x - area.x}
      initialPositionY={box.y - area.y}
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
        wrapperStyle={{
          position: 'absolute',
          left: area.x,
          top: area.y,
          width: area.width,
          height: area.height,
          overflow: 'visible',
        }}
        contentStyle={{ width: box.width, height: box.height }}
      >
        <ImageLayers
          tile={tile}
          box={{ x: 0, y: 0, width: box.width, height: box.height }}
          hiRes={showOriginal}
          alt={alt}
        />
      </TransformComponent>
    </TransformWrapper>
  );
}
