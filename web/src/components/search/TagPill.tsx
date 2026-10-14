import type { ReactNode } from 'react';
import clsx from 'clsx';
import { displayTagName, type TagCategory } from '@eikon/shared';
import styles from './TagPill.module.css';

interface TagPillProps {
  name: string;
  category?: TagCategory;
  count?: number;
  mode?: 'include' | 'exclude';
  manual?: boolean;
  size?: 'sm' | 'md';
  trailing?: ReactNode;
  className?: string;
}

/** Visual tag token, coloured by category. Wrap in a button/link for interaction. */
export function TagPill({
  name,
  category = 'general',
  count,
  mode,
  manual,
  size = 'md',
  trailing,
  className,
}: TagPillProps) {
  return (
    <span
      className={clsx(styles.pill, styles[size], mode === 'exclude' && styles.exclude, className)}
      data-category={category}
    >
      {mode === 'exclude' && <span className={styles.minus}>−</span>}
      <span className={styles.name}>{displayTagName(name)}</span>
      {manual && <span className={styles.manual} title="Added by you" aria-label="added by you" />}
      {count !== undefined && <span className={styles.count}>{count.toLocaleString('en-US')}</span>}
      {trailing}
    </span>
  );
}
