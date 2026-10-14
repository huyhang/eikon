import clsx from 'clsx';
import { motion, type MotionValue } from 'motion/react';
import { formatCount } from '../../core/format';
import { Icon } from '../common/Icon';
import styles from './Viewer.module.css';

export function NavArrows({
  showPrev,
  showNext,
  onPrev,
  onNext,
}: {
  showPrev: boolean;
  showNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <>
      {showPrev && (
        <button
          type="button"
          className={clsx(styles.arrow, styles.arrowLeft)}
          onClick={onPrev}
          aria-label="Previous"
        >
          <Icon name="chevronLeft" size={22} strokeWidth={2.2} />
        </button>
      )}
      {showNext && (
        <button
          type="button"
          className={clsx(styles.arrow, styles.arrowRight)}
          onClick={onNext}
          aria-label="Next"
        >
          <Icon name="chevronRight" size={22} strokeWidth={2.2} />
        </button>
      )}
    </>
  );
}

export function TopBar({
  opacity,
  position,
  total,
  onClose,
  split,
  onToggleSplit,
}: {
  opacity: MotionValue<number>;
  position: number;
  total: number;
  onClose: () => void;
  split: boolean;
  /** Absent where split view isn't available (narrow screens). */
  onToggleSplit?: () => void;
}) {
  return (
    <motion.header className={styles.topBar} style={{ opacity }}>
      <button type="button" className={styles.roundButton} onClick={onClose} aria-label="Close viewer">
        <Icon name="close" size={18} strokeWidth={2.2} />
      </button>
      <span className={styles.counter}>
        {formatCount(position)} of {formatCount(total)}
      </span>
      {onToggleSplit ? (
        <button
          type="button"
          className={clsx(styles.roundButton, split && styles.roundActive)}
          onClick={onToggleSplit}
          aria-label={split ? 'Full screen viewer' : 'Show the grid beside the viewer'}
          aria-pressed={split}
          title={split ? 'Full screen' : 'Split view'}
        >
          <Icon name="split" size={18} />
        </button>
      ) : (
        <span className={styles.topSpacer} />
      )}
    </motion.header>
  );
}

export interface ToolbarProps {
  opacity: MotionValue<number>;
  ready: boolean;
  favorite: boolean;
  infoOpen: boolean;
  editing: boolean;
  onShare: () => void;
  onToggleFavorite: () => void;
  onToggleInfo: () => void;
  onEdit: () => void;
  onFindSimilar?: () => void;
  onPlay?: () => void;
}

export function Toolbar(props: ToolbarProps) {
  return (
    <motion.nav className={styles.toolbar} style={{ opacity: props.opacity }} aria-label="Image actions">
      <ToolbarButton icon="share" label="Share" onClick={props.onShare} disabled={!props.ready} />
      <ToolbarButton
        icon="heart"
        label={props.favorite ? 'Unfavorite' : 'Favorite'}
        onClick={props.onToggleFavorite}
        active={props.favorite}
        disabled={!props.ready}
      />
      <ToolbarButton icon="info" label="Info" onClick={props.onToggleInfo} active={props.infoOpen} />
      <ToolbarButton icon="pencil" label="Edit tags" onClick={props.onEdit} active={props.editing} />
      {props.onFindSimilar && (
        <ToolbarButton icon="similar" label="More like this" onClick={props.onFindSimilar} />
      )}
      {props.onPlay && <ToolbarButton icon="play" label="Slideshow" onClick={props.onPlay} />}
    </motion.nav>
  );
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: 'share' | 'heart' | 'info' | 'pencil' | 'similar' | 'play';
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className={clsx(
        styles.toolButton,
        active && styles.toolActive,
        icon === 'heart' && active && styles.favorite,
      )}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
    >
      <Icon name={icon} size={22} filled={icon === 'heart' && active} />
    </button>
  );
}
