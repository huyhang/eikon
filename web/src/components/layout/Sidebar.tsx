import { useState, type ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import clsx from 'clsx';
import type { GroupKind } from '@eikon/shared';
import { useDeleteSavedSearch, useGroups, useSavedSearches } from '../../api/hooks';
import { formatCompact } from '../../core/format';
import { savedQueryToSearch, searchToParams } from '../../core/searchState';
import { Icon } from '../common/Icon';
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
      <nav className={styles.scroll} aria-label="Sidebar">
        <ul className={styles.list}>
          {SIDEBAR_NAV.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.to === '/'} className={navClass}>
                <Icon name={item.icon} size={19} />
                <span>{item.label}</span>
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
  const remove = useDeleteSavedSearch();
  const navigate = useNavigate();
  if (!data?.length) return null;
  return (
    <Section title="Pinned">
      <ul className={styles.list}>
        {data.map((saved) => (
          <li key={saved.id} className={styles.pinned}>
            <button
              type="button"
              className={styles.link}
              onClick={() => navigate(`/search?${searchToParams(savedQueryToSearch(saved.query))}`)}
            >
              <span className={styles.hash}>#</span>
              <span className={styles.truncate}>{saved.name}</span>
            </button>
            <button
              type="button"
              className={styles.unpin}
              aria-label={`Unpin ${saved.name}`}
              onClick={() => remove.mutate(saved.id)}
            >
              <Icon name="close" size={12} strokeWidth={2.4} />
            </button>
          </li>
        ))}
      </ul>
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
