import { useId, type ReactNode } from 'react';
import { Link } from 'react-router';
import clsx from 'clsx';
import { Icon } from './Icon';
import styles from './Section.module.css';

interface SectionProps {
  title: string;
  seeAll?: string;
  action?: ReactNode;
  children: ReactNode;
  flush?: boolean;
  /** Lets the section fold away to just its title; the caller remembers the choice. */
  collapse?: { collapsed: boolean; onToggle: () => void };
}

/**
 * A titled block; with `seeAll` the title (with its chevron) links to the full list, as in Photos.
 * A collapsed section renders none of its content, so its images aren't loaded either.
 */
export function Section({ title, seeAll, action, children, flush, collapse }: SectionProps) {
  const contentId = useId();
  const collapsed = collapse?.collapsed ?? false;
  return (
    <section className={styles.section}>
      <header className={clsx(styles.header, collapsed && styles.collapsedHeader)}>
        {seeAll ? (
          <Link to={seeAll} className={styles.titleLink}>
            <h2>{title}</h2>
            <Icon name="chevronRight" size={18} strokeWidth={2.4} />
          </Link>
        ) : (
          <h2>{title}</h2>
        )}
        <div className={styles.end}>
          {!collapsed && action}
          {collapse && (
            <button
              type="button"
              className={styles.collapse}
              onClick={collapse.onToggle}
              aria-label={title}
              aria-expanded={!collapsed}
              aria-controls={contentId}
            >
              <Icon
                name="chevronDown"
                size={18}
                strokeWidth={2.4}
                className={clsx(styles.chevron, collapsed && styles.chevronCollapsed)}
              />
            </button>
          )}
        </div>
      </header>
      <div id={contentId} className={flush ? undefined : styles.padded} hidden={collapsed}>
        {!collapsed && children}
      </div>
    </section>
  );
}
