import { useState, type ReactNode } from 'react';
import { Link, NavLink } from 'react-router';
import clsx from 'clsx';
import type { GroupKind } from '@eikon/shared';
import { useGroups, useSavedSearches, useStatus } from '../../api/hooks';
import { formatCompact } from '../../core/format';
import { Icon } from '../common/Icon';
import { OPEN_PALETTE_EVENT } from '../palette/CommandPalette';
import { PinnedSearchList } from '../search/PinnedSearchList';
import { LogoMark } from './Logo';
import { groupPath, SIDEBAR_NAV } from './navigation';
import { SafeModeToggle } from './SafeModeToggle';
import { StatusRing } from './StatusRing';
import styles from './Sidebar.module.css';

const navClass = ({ isActive }: { isActive: boolean }) => clsx(styles.link, isActive && styles.active);

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.brand}>
        <Link to="/" className={styles.brandLink}>
          <LogoMark size={26} />
          <span>Eikon</span>
        </Link>
        <StatusRing />
      </div>
      <button
        type="button"
        className={styles.jump}
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
      >
        <Icon name="search" size={15} />
        <span>Jump to…</span>
        <kbd>⌘K</kbd>
      </button>
      <nav className={styles.scroll} aria-label="Sidebar">
        <ul className={styles.list}>
          {SIDEBAR_NAV.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} className={navClass}>
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
                {item.to === '/review' && <ReviewBadge />}
              </NavLink>
            </li>
          ))}
        </ul>
        <PinnedSearches />
        <GroupList kind="illustrator" title="Illustrators" />
        <GroupList kind="collection" title="Collections" />
      </nav>
      <div className={styles.footer}>
        <SafeModeToggle />
        <NavLink
          to="/settings"
          className={({ isActive }) => clsx(styles.settings, isActive && styles.active)}
          aria-label="Settings"
        >
          <Icon name="gear" size={19} />
        </NavLink>
      </div>
    </aside>
  );
}

function ReviewBadge() {
  const pending = useStatus().data?.review.pending ?? 0;
  return pending > 0 ? <span className={styles.count}>{formatCompact(pending)}</span> : null;
}

function Section({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.sectionTitle}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <Icon
          name="chevronDown"
          size={13}
          strokeWidth={2.4}
          className={clsx(styles.chevron, !open && styles.closed)}
        />
      </button>
      {open && children}
    </section>
  );
}

function PinnedSearches() {
  const { data } = useSavedSearches();
  if (!data?.length) return null;
  return (
    <Section title="Pinned">
      <PinnedSearchList variant="compact" />
    </Section>
  );
}

const SIDEBAR_GROUP_LIMIT = 40;

function GroupList({ kind, title }: { kind: GroupKind; title: string }) {
  const { data } = useGroups(kind, 'name');
  if (!data?.length) return null;
  const shown = data.slice(0, SIDEBAR_GROUP_LIMIT);
  return (
    <Section title={title} defaultOpen={kind === 'illustrator'}>
      <ul className={styles.list}>
        {shown.map((group) => (
          <li key={group.id}>
            <NavLink to={groupPath(kind, group.id)} className={navClass}>
              <span className={styles.truncate}>{group.name}</span>
              <span className={styles.count}>{formatCompact(group.imageCount)}</span>
            </NavLink>
          </li>
        ))}
        {data.length > shown.length && (
          <li>
            <Link
              to={kind === 'illustrator' ? '/illustrators' : '/collections'}
              className={clsx(styles.link, styles.more)}
            >
              See all {data.length}
            </Link>
          </li>
        )}
      </ul>
    </Section>
  );
}
