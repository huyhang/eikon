import { Link } from 'react-router';
import clsx from 'clsx';
import type { GroupSummary } from '@eikon/shared';
import { formatCount } from '../../core/format';
import { ProgressiveImage } from '../common/ProgressiveImage';
import { groupPath } from '../layout/navigation';
import styles from './GroupCard.module.css';

/** Cover mosaic: one hero image, or a 2×2 grid when the group has four or more images. */
export function CoverMosaic({ group, className }: { group: GroupSummary; className?: string }) {
  const covers = group.covers.length >= 4 ? group.covers.slice(0, 4) : group.covers.slice(0, 1);
  return (
    <div className={clsx(styles.mosaic, covers.length === 4 && styles.quad, className)}>
      {covers.length === 0 && <div className={styles.emptyCover} />}
      {covers.map((tile) => (
        <ProgressiveImage key={tile.id} tile={tile} />
      ))}
    </div>
  );
}

export function GroupCard({ group, size = 'md' }: { group: GroupSummary; size?: 'md' | 'lg' }) {
  return (
    <Link to={groupPath(group.kind, group.id)} className={clsx(styles.card, styles[size])}>
      <CoverMosaic group={group} />
      <div className={styles.caption}>
        <span className={styles.name}>{group.name}</span>
        <span className={styles.count}>{formatCount(group.imageCount)}</span>
      </div>
    </Link>
  );
}
