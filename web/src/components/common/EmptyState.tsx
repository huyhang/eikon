import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  icon: IconName;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}

export function EmptyState({ icon, title, children, action }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <div className={styles.icon}>
        <Icon name={icon} size={34} strokeWidth={1.5} />
      </div>
      <h2>{title}</h2>
      {children && <div className={styles.body}>{children}</div>}
      {action}
    </div>
  );
}
