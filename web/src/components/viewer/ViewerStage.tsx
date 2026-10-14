import type { ReactNode, RefObject } from 'react';
import { motion, useTransform, type MotionValue } from 'motion/react';
import type { ImageDetail, ImageTile } from '@eikon/shared';
import { altTextFor } from '../../core/altText';
import type { ViewerLayout } from '../../core/viewerLayout';
import { ViewerImage } from './ViewerImage';
import styles from './Viewer.module.css';

export const SLIDE_GAP = 24;

interface ViewerStageProps {
  stageRef: RefObject<HTMLDivElement | null>;
  tiles: ImageTile[];
  index: number;
  layout: ViewerLayout;
  detail: ImageDetail | undefined;
  motion: {
    trackX: MotionValue<number>;
    flipX: MotionValue<number>;
    flipY: MotionValue<number>;
    flipScale: MotionValue<number>;
  };
  onZoomChange: (zoomed: boolean) => void;
  children: ReactNode;
}

/** The current picture between its neighbours on a horizontal track, plus whatever chrome floats over it. */
export function ViewerStage({
  stageRef,
  tiles,
  index,
  layout,
  detail,
  motion: m,
  onZoomChange,
  children,
}: ViewerStageProps) {
  const distance = layout.stage.width + SLIDE_GAP;
  return (
    <div
      ref={stageRef}
      className={styles.stage}
      style={{ width: layout.stage.width, height: layout.stage.height }}
    >
      {[-1, 0, 1].map((offset) => {
        const slideTile = tiles[index + offset];
        if (!slideTile) return null;
        const current = offset === 0;
        const image = (
          <ViewerImage
            tile={slideTile}
            stage={layout.stage}
            insets={layout.insets}
            padding={layout.padding}
            alt={current && detail?.id === slideTile.id ? altTextFor(detail) : ''}
            active={current}
            animated={current && detail?.id === slideTile.id && detail.animated}
            onZoomChange={current ? onZoomChange : undefined}
          />
        );
        return (
          <Slide key={slideTile.id} trackX={m.trackX} offset={offset} distance={distance}>
            {current ? (
              <motion.div className={styles.flip} style={{ x: m.flipX, y: m.flipY, scale: m.flipScale }}>
                {image}
              </motion.div>
            ) : (
              image
            )}
          </Slide>
        );
      })}
      {children}
    </div>
  );
}

function Slide({
  trackX,
  offset,
  distance,
  children,
}: {
  trackX: MotionValue<number>;
  offset: number;
  distance: number;
  children: ReactNode;
}) {
  const x = useTransform(trackX, (v) => v + offset * distance);
  return (
    <motion.div className={styles.slide} style={{ x }} aria-hidden={offset !== 0}>
      {children}
    </motion.div>
  );
}
