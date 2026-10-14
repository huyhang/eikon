import type { ReactNode } from 'react';
import clsx from 'clsx';
import styles from './HorizontalRow.module.css';

/** Swipeable, scroll-snapping row that bleeds to the screen edges. */
export function HorizontalRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx(styles.row, className)}>{children}</div>;
}
