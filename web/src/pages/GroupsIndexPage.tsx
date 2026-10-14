import { useDeferredValue, useState } from 'react';
import type { GroupKind, GroupSort, GroupSummary } from '@eikon/shared';
import { useGroups } from '../api/hooks';
import { pluralize } from '../core/format';
import { Segmented } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { Icon } from '../components/common/Icon';
import { GroupCard } from '../components/groups/GroupCard';
import { PageHeader } from '../components/layout/PageHeader';
import { PageError, PageLoading } from './PageStates';
import styles from './GroupsIndexPage.module.css';

const SORT_OPTIONS: { value: GroupSort; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'count', label: 'Most images' },
  { value: 'recent', label: 'Recent' },
];

export function filterGroups(groups: GroupSummary[], filter: string): GroupSummary[] {
  const needle = filter.trim().toLocaleLowerCase();
  return needle ? groups.filter((g) => g.name.toLocaleLowerCase().includes(needle)) : groups;
}

const COPY: Record<GroupKind, { title: string; noun: string; empty: string }> = {
  illustrator: {
    title: 'Illustrators',
    noun: 'illustrator',
    empty: 'Add a folder per illustrator inside Illustrators/ and Eikon will pick it up on the next scan.',
  },
  collection: {
    title: 'Collections',
    noun: 'collection',
    empty: 'Add a folder per collection inside Collections/ — images can come from any illustrator.',
  },
};

export function GroupsIndexPage({ kind }: { kind: GroupKind }) {
  const [sort, setSort] = useState<GroupSort>('name');
  const [filter, setFilter] = useState('');
  const deferredFilter = useDeferredValue(filter);
  const { data, isPending, isError, refetch } = useGroups(kind, sort);
  const copy = COPY[kind];

  if (isPending) return <PageLoading />;
  if (isError) return <PageError onRetry={() => refetch()} />;
  const shown = filterGroups(data, deferredFilter);

  return (
    <div className={styles.page}>
      <PageHeader title={copy.title} subtitle={pluralize(data.length, copy.noun)}>
        {data.length > 0 && (
          <div className={styles.toolbar}>
            <label className={styles.filter}>
              <Icon name="search" size={16} />
              <input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={`Filter ${copy.title.toLowerCase()}`}
                aria-label={`Filter ${copy.title.toLowerCase()}`}
                autoCapitalize="none"
                autoCorrect="off"
              />
            </label>
            <Segmented label="Sort" value={sort} options={SORT_OPTIONS} onChange={setSort} />
          </div>
        )}
      </PageHeader>

      {data.length === 0 ? (
        <EmptyState
          icon={kind === 'illustrator' ? 'illustrators' : 'collections'}
          title={`No ${copy.title.toLowerCase()} yet`}
        >
          <p>{copy.empty}</p>
        </EmptyState>
      ) : shown.length === 0 ? (
        <EmptyState icon="search" title="No matches">
          <p>Nothing matches “{filter}”.</p>
        </EmptyState>
      ) : (
        <div className={styles.grid}>
          {shown.map((group) => (
            <GroupCard key={group.id} group={group} size="lg" />
          ))}
        </div>
      )}
    </div>
  );
}
