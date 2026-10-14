import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import type { ImageQuery } from '@eikon/shared';
import { ApiRequestError, type ImageList } from '../api/client';
import {
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useGroups,
  useImages,
  useRelatedTags,
  useSavedSearches,
  useTopTags,
} from '../api/hooks';
import { useNewSeed } from '../context/Dependencies';
import { usePrefs } from '../context/Prefs';
import { formatCount } from '../core/format';
import {
  describeSearch,
  emptyResultMessage,
  hasCriteria,
  isRanked,
  searchFromParams,
  searchKey,
  searchToImageQuery,
  searchToParams,
  searchToSavedQuery,
  type SearchAction,
  type SearchState,
} from '../core/searchState';
import { Segmented, Spinner } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { Icon } from '../components/common/Icon';
import { ImageCollection } from '../components/grid/ImageCollection';
import { PageHeader } from '../components/layout/PageHeader';
import { DescribeInput } from '../components/search/DescribeInput';
import { SearchBar } from '../components/search/SearchBar';
import { SearchFilters } from '../components/search/SearchFilters';
import { SimilarHeader } from '../components/search/SimilarHeader';
import { TagCloud } from '../components/search/TagCloud';
import { TagPill } from '../components/search/TagPill';
import { useCapabilities } from '../hooks/useCapabilities';
import { useSearchUrlState } from '../hooks/useSearchUrlState';
import styles from './SearchPage.module.css';

type Mode = 'tags' | 'describe';

const MODES: { value: Mode; label: string }[] = [
  { value: 'tags', label: 'Tags' },
  { value: 'describe', label: 'Describe' },
];

/** How many popular tags show before "Show all". */
export const POPULAR_TAGS_SHOWN = 30;

function useAllGroups() {
  const illustrators = useGroups('illustrator', 'name');
  const collections = useGroups('collection', 'name');
  return useMemo(
    () => [...(illustrators.data ?? []), ...(collections.data ?? [])],
    [illustrators.data, collections.data],
  );
}

export function SearchPage() {
  const [state, dispatch] = useSearchUrlState();
  const capabilities = useCapabilities();
  const [preferredMode, setPreferredMode] = useState<Mode>('tags');
  const mode: Mode =
    state.text !== undefined ? 'describe' : state.like !== undefined ? 'tags' : preferredMode;
  const active = hasCriteria(state);
  const ranked = isRanked(state);
  const query = useMemo(() => searchToImageQuery(state), [state]);
  const results = useImages(query, active);
  const groups = useAllGroups();
  const groupName = groups.find((g) => g.id === state.group)?.name;
  const { addRecentSearch } = usePrefs();
  const newSeed = useNewSeed();

  useRememberSearch(state, active && (results.data?.total ?? 0) > 0, addRecentSearch);

  const switchMode = (next: Mode) => {
    setPreferredMode(next);
    if (next === 'tags' && state.text !== undefined) dispatch({ type: 'setText', text: '' });
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="Search"
        collapsedTitle={active ? describeSearch(state, groupName) : undefined}
        actions={active && !ranked ? <PinButton state={state} groupName={groupName} /> : undefined}
      >
        <div className={styles.searchArea}>
          {(capabilities.describe || mode === 'describe') && state.like === undefined && (
            <Segmented label="Search by" value={mode} options={MODES} onChange={switchMode} />
          )}
          {state.like !== undefined && (
            <SimilarHeader
              imageId={state.like}
              onClear={() => dispatch({ type: 'setLike', like: undefined })}
            />
          )}
          {mode === 'describe' && (
            <DescribeInput
              value={state.text ?? ''}
              onSubmit={(text) => dispatch({ type: 'setText', text })}
              autoFocus={state.text === undefined}
            />
          )}
          <SearchBar
            state={state}
            dispatch={dispatch}
            placeholder={ranked || mode === 'describe' ? 'Filter by tags' : 'Search tags'}
            autoFocus={!active && mode === 'tags' && window.innerWidth >= 768}
          />
          <div className={styles.filters}>
            <SearchFilters
              groups={groups}
              group={state.group}
              onGroupChange={(group) => dispatch({ type: 'setGroup', group })}
              sort={state.sort}
              onSortChange={(sort) =>
                dispatch({ type: 'setSort', sort, seed: sort === 'random' ? newSeed() : undefined })
              }
              ranked={ranked}
            />
            {active && results.data && <ResultCount list={results.data} ranked={ranked} />}
          </div>
          {active && !ranked && <RelatedTags query={query} dispatch={dispatch} />}
        </div>
      </PageHeader>

      <Results state={state} active={active} results={results} groupName={groupName} dispatch={dispatch} />
    </div>
  );
}

function ResultCount({ list, ranked }: { list: ImageList; ranked: boolean }) {
  const one = list.total === 1;
  const noun = ranked ? (one ? 'best match' : 'best matches') : one ? 'result' : 'results';
  return (
    <span className={styles.count} aria-live="polite">
      {formatCount(list.total)} {noun}
    </span>
  );
}

function RelatedTags({ query, dispatch }: { query: ImageQuery; dispatch: (action: SearchAction) => void }) {
  const related = useRelatedTags(query, true);
  if (!related.data?.length) return null;
  return (
    <div className={styles.related}>
      <span className={styles.relatedLabel}>Related</span>
      <div className={styles.relatedRow}>
        {related.data.map((tag) => (
          <button key={tag.name} type="button" onClick={() => dispatch({ type: 'add', tag: tag.name })}>
            <TagPill name={tag.name} category={tag.category} count={tag.count} size="sm" />
          </button>
        ))}
      </div>
    </div>
  );
}

function Results({
  state,
  active,
  results,
  groupName,
  dispatch,
}: {
  state: SearchState;
  active: boolean;
  results: ReturnType<typeof useImages>;
  groupName: string | undefined;
  dispatch: (action: SearchAction) => void;
}) {
  if (!active) return <SearchStart onPick={(tag) => dispatch({ type: 'add', tag })} />;
  if (results.isError) {
    const message =
      results.error instanceof ApiRequestError ? results.error.message : 'Eikon couldn’t run this search.';
    return (
      <EmptyState icon="wifiOff" title="Search unavailable">
        <p>{message}</p>
      </EmptyState>
    );
  }
  if (!results.data) {
    return (
      <div className={styles.loading}>
        <Spinner />
      </div>
    );
  }
  if (results.data.tiles.length === 0) {
    const message = isRanked(state)
      ? 'Nothing matches with these filters. Try removing a tag.'
      : emptyResultMessage(state, { groupName });
    return (
      <EmptyState icon="search" title="No matches">
        <p>{message}</p>
      </EmptyState>
    );
  }
  return (
    <div className={results.isPlaceholderData ? styles.stale : undefined}>
      <ImageCollection tiles={results.data.tiles} contextKey="search" primary groupId={state.group} />
    </div>
  );
}

/** Remembers a search once it has stayed on screen with results for a moment. */
function useRememberSearch(
  state: SearchState,
  worthRemembering: boolean,
  remember: (s: SearchState) => void,
) {
  // The key carries all the criteria, so the effect rebuilds the search from it.
  const key = searchKey(state);
  useEffect(() => {
    if (!worthRemembering) return;
    const timer = window.setTimeout(() => remember(searchFromParams(new URLSearchParams(key))), 1200);
    return () => window.clearTimeout(timer);
  }, [key, worthRemembering, remember]);
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
      aria-label={existing ? 'Unpin this search' : 'Pin this search'}
      title={existing ? 'Unpin' : 'Pin to Saved'}
    >
      <Icon name="star" size={21} filled={Boolean(existing)} />
    </button>
  );
}

const sameTags = (a: string[], b: string[]) => a.length === b.length && a.every((t) => b.includes(t));

function matches(query: { tags: string[]; exclude: string[]; group?: number }, state: SearchState): boolean {
  return (
    sameTags(query.tags, state.include) &&
    sameTags(query.exclude, state.exclude) &&
    query.group === state.group
  );
}

function SearchStart({ onPick }: { onPick: (tag: string) => void }) {
  const top = useTopTags(120);
  const [showAll, setShowAll] = useState(false);
  const { recentSearches, clearRecentSearches } = usePrefs();
  const tags = top.data ?? [];
  const shown = showAll ? tags : tags.slice(0, POPULAR_TAGS_SHOWN);
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
          {tags.length > POPULAR_TAGS_SHOWN && (
            <button type="button" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show fewer' : `Show all ${tags.length}`}
            </button>
          )}
        </header>
        {!top.data ? (
          <Spinner />
        ) : tags.length ? (
          <TagCloud tags={shown} onPick={onPick} />
        ) : (
          <p className={styles.muted}>Tags appear here once gpubox has analyzed some images.</p>
        )}
      </section>
    </div>
  );
}
