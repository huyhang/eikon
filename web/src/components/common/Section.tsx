import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Icon } from './Icon';
import styles from './Section.module.css';

interface SectionProps {
  title: string;
  seeAll?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
}

export function Section({ title, seeAll, action, children, flush }: SectionProps) {
  return (
    <section className={styles.section}>
      <header className={styles.header}>
        {seeAll ? (
          <Link to={seeAll} className={styles.titleLink}>
            <h2>{title}</h2>
            <Icon name="chevronRight" size={18} strokeWidth={2.4} />
          </Link>
        ) : (
          <h2>{title}</h2>
        )}
        {action ??
          (seeAll && (
            <Link to={seeAll} className={styles.seeAll}>
              See All
            </Link>
          ))}
      </header>
      <div className={flush ? undefined : styles.padded}>{children}</div>
    </section>
  );
}
