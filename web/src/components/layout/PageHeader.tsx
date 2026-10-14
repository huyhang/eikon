import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router';
import clsx from 'clsx';
import { Icon } from '../common/Icon';
import { SafeModeToggle } from './SafeModeToggle';
import { StatusRing } from './StatusRing';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Shows a back button that returns to the previous page, or to this path when there is no history. */
  back?: { to: string; label: string };
  actions?: ReactNode;
  children?: ReactNode;
  /** Visual above the title (e.g. a cover mosaic on group pages). */
  hero?: ReactNode;
  /** What the frosted bar says once the large title has scrolled away (defaults to the title). */
  collapsedTitle?: string;
}

/** Large title that collapses into a frosted bar as the page scrolls, like iOS. */
export function PageHeader({
  title,
  subtitle,
  back,
  actions,
  children,
  hero,
  collapsedTitle,
}: PageHeaderProps) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const collapsed = useCollapsed(titleRef);
  const navigate = useNavigate();

  const goBack = () => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navigate(-1);
    else if (back) navigate(back.to);
  };

  return (
    <>
      <div className={clsx(styles.bar, collapsed && styles.collapsed)}>
        <div className={styles.barSide}>
          {back && (
            <button type="button" className={styles.back} onClick={goBack}>
              <Icon name="chevronLeft" size={22} strokeWidth={2.2} />
              <span>{back.label}</span>
            </button>
          )}
        </div>
        <div className={styles.barTitle} aria-hidden={!collapsed}>
          {collapsedTitle ?? title}
        </div>
        <div className={clsx(styles.barSide, styles.barActions)}>
          {actions}
          <span className={styles.mobileOnly}>
            <StatusRing />
            <SafeModeToggle compact />
            <Link to="/settings" className={styles.gear} aria-label="Settings">
              <Icon name="gear" size={20} />
            </Link>
          </span>
        </div>
      </div>
      <header className={styles.hero}>
        {hero}
        <h1 ref={titleRef} className={styles.title}>
          {title}
        </h1>
        {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        {children}
      </header>
    </>
  );
}

function useCollapsed(ref: RefObject<HTMLElement | null>): boolean {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setCollapsed(!entry!.isIntersecting), {
      rootMargin: '-56px 0px 0px 0px',
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);
  return collapsed;
}
