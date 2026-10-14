import { useEffect, useMemo } from 'react';
import { Link } from 'react-router';
import type { GroupSummary, ImageSort } from '@eikon/shared';
import {
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useGroups,
  useImages,
  useRelatedTags,
  useSavedSearches,
  useTopTags,
} from '../api/hooks';
import { usePrefs } from '../context/Prefs';
import { formatCount } from '../core/format';
import {
  describeSearch,
  hasCriteria,
  searchKey,
  searchToImageQuery,
  searchToParams,
  searchToSavedQuery,
  type SearchState,
} from '../core/searchState';
import { Segmented, Spinner } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { Icon } from '../components/common/Icon';
import { ImageCollection } from '../components/grid/ImageCollection';
import { PageHeader } from '../components/layout/PageHeader';
import { SearchBar } from '../components/search/SearchBar';
import { TagCloud } from '../components/search/TagCloud';
import { TagPill } from '../components/search/TagPill';
import { useSearchUrlState } from '../hooks/useSearchUrlState';
import styles from './SearchPage.module.css';

const SORTS: { value: ImageSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'random', label: 'Shuffle' },
];

export function SearchPage() {
  const [state, dispatch] = useSearchUrlState();
  const active = hasCriteria(state);
  const query = useMemo(() => searchToImageQuery(state), [state]);
  const results = useImages(query, active);
  const related = useRelatedTags(query, active);
  const illustrators = useGroups('illustrator', 'name');
  const collections = useGroups('collection', 'name');
  const groups = useMemo(
    () => [...(illustrators.data ?? []), ...(collections.data ?? [])],
    [illustrators.data, collections.data],
  );
  const groupName = groups.find((g) => g.id === state.group)?.name;
  const { addRecentSearch } = usePrefs();

  useRememberSearch(state, active && (results.data?.total ?? 0) > 0, addRecentSearch);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Search"
        actions={active ? <PinButton state={state} groupName={groupName} /> : undefined}
      >
        <div className={styles.searchArea}>
          <SearchBar state={state} dispatch={dispatch} autoFocus={!active && window.innerWidth >= 768} />
          <div className={styles.filters}>
            <GroupFilter
              groups={groups}
              value={state.group}
              onChange={(group) => dispatch({ type: 'setGroup', group })}
            />
            <Segmented
              label="Sort"
              value={state.sort}
              options={SORTS}
              onChange={(sort) => dispatch({ type: 'setSort', sort })}
            />
            {active && results.data && (
              <span className={styles.count} aria-live="polite">
                {formatCount(results.data.total)} {results.data.total === 1 ? 'result' : 'results'}
              </span>
            )}
          </div>
          {active && (related.data?.length ?? 0) > 0 && (
            <div className={styles.related}>
              <span className={styles.relatedLabel}>Related</span>
              <div className={styles.relatedRow}>
                {related.data!.map((tag) => (
                  <button
                    key={tag.name}
                    type="button"
                    onClick={() => dispatch({ type: 'add', tag: tag.name })}
                  >
                    <TagPill name={tag.name} category={tag.category} count={tag.count} size="sm" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </PageHeader>

      {!active ? (
        <SearchStart onPick={(tag) => dispatch({ type: 'add', tag })} />
      ) : !results.data ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : results.data.tiles.length === 0 ? (
        <EmptyState icon="search" title="No matches">
          <p>No images have all of these tags{groupName ? ` in ${groupName}` : ''}. Try removing one.</p>
        </EmptyState>
      ) : (
        <div className={results.isPlaceholderData ? styles.stale : undefined}>
          <ImageCollection tiles={results.data.tiles} contextKey="search" primary groupId={state.group} />
        </div>
      )}
    </div>
  );
}

function useRememberSearch(
  state: SearchState,
  worthRemembering: boolean,
  remember: (s: SearchState) => void,
) {
  const key = searchKey(state);
  useEffect(() => {
    if (!worthRemembering) return;
    const timer = window.setTimeout(() => remember(state), 1200);
    return () => window.clearTimeout(timer);
    // `state` is captured by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, worthRemembering, remember]);
}

function GroupFilter({
  groups,
  value,
  onChange,
}: {
  groups: GroupSummary[];
  value?: number;
  onChange: (id?: number) => void;
}) {
  const illustrators = groups.filter((g) => g.kind === 'illustrator');
  const collections = groups.filter((g) => g.kind === 'collection');
  return (
    <label className={styles.groupFilter}>
      <span>In:</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        aria-label="Limit search to an illustrator or collection"
      >
        <option value="">All images</option>
        {illustrators.length > 0 && (
          <optgroup label="Illustrators">
            {illustrators.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </optgroup>
        )}
        {collections.length > 0 && (
          <optgroup label="Collections">
            {collections.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <Icon name="chevronDown" size={13} strokeWidth={2.4} />
    </label>
  );
}

function PinButton({ state, groupName }: { state: SearchState; groupName?: string }) {
  const saved = useSavedSearches();
  const create = useCreateSavedSearch();
  const remove = useDeleteSavedSearch();
  const existing = saved.data?.find((s) => matches(s.query, state));
  const toggle = () => {
    if (existing) remove.mutate(existing.id);
    else create.mutate({ name: describeSearch(state, groupName), query: searchToSavedQuery(state) });
  };
  return (
    <button
      type="button"
      className={styles.pin}
      onClick={toggle}
      aria-pressed={Boolean(existing)}
      aria-label={existing ? 'Unpin this search' : 'Pin this search to the sidebar'}
      title={existing ? 'Unpin' : 'Pin to sidebar'}
    >
      <Icon name="star" size={21} filled={Boolean(existing)} />
    </button>
  );
}

function matches(query: { tags: string[]; exclude: string[]; group?: number }, state: SearchState): boolean {
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));
  return same(query.tags, state.include) && same(query.exclude, state.exclude) && query.group === state.group;
}

function SearchStart({ onPick }: { onPick: (tag: string) => void }) {
  const top = useTopTags(60);
  const { recentSearches, clearRecentSearches } = usePrefs();
  return (
    <div className={styles.start}>
      {recentSearches.length > 0 && (
        <section>
          <header className={styles.startHeader}>
            <h2>Recent</h2>
            <button type="button" onClick={clearRecentSearches}>
              Clear
            </button>
          </header>
          <ul className={styles.recent}>
            {recentSearches.map((search) => (
              <li key={searchKey(search)}>
                <Link to={`/search?${searchToParams(search)}`}>
                  <Icon name="search" size={15} />
                  <span>{describeSearch(search)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section>
        <header className={styles.startHeader}>
          <h2>Popular tags</h2>
        </header>
        {top.data ? (
          top.data.length ? (
            <TagCloud tags={top.data} onPick={onPick} />
          ) : (
            <p className={styles.muted}>Tags appear here once gpubox has analyzed some images.</p>
          )
        ) : (
          <Spinner />
        )}
      </section>
    </div>
  );
}
