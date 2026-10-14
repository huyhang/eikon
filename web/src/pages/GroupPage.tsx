import { useMemo } from 'react';
import { Link, useParams } from 'react-router';
import type { GroupKind, TagCount } from '@eikon/shared';
import { isNotFound } from '../api/client';
import { useGroup, useImages } from '../api/hooks';
import { useNewSeed } from '../context/Dependencies';
import { usePrefs } from '../context/Prefs';
import { pluralize } from '../core/format';
import { clampDensity, defaultDensity } from '../core/gestures';
import {
  EMPTY_SEARCH,
  emptyResultMessage,
  hasCriteria,
  searchToImageQuery,
  searchToParams,
  type SearchAction,
  type SearchState,
} from '../core/searchState';
import { IconButton, Segmented, Spinner } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { ImageCollection } from '../components/grid/ImageCollection';
import { CoverMosaic } from '../components/groups/GroupCard';
import { PageHeader } from '../components/layout/PageHeader';
import { SORTS } from '../components/search/SearchFilters';
import { TagPill } from '../components/search/TagPill';
import { SelectButton } from '../components/selection/BulkBar';
import { useSearchUrlState } from '../hooks/useSearchUrlState';
import { PageError, PageLoading } from './PageStates';
import styles from './GroupPage.module.css';

const TOP_TAGS_SHOWN = 16;

export function GroupPage({ kind }: { kind: GroupKind }) {
  const id = Number(useParams().id);
  const [state, dispatch] = useSearchUrlState();
  const newSeed = useNewSeed();
  const group = useGroup(id);
  const query = useMemo(() => ({ ...searchToImageQuery(state), group: id }), [state, id]);
  const images = useImages(query, Number.isInteger(id));
  const back =
    kind === 'illustrator'
      ? { to: '/illustrators', label: 'Illustrators' }
      : { to: '/collections', label: 'Collections' };

  if (group.isPending) return <PageLoading />;
  if (group.isError) {
    return isNotFound(group.error) ? (
      <EmptyState icon="folder" title="Not found" action={<Link to={back.to}>Back to {back.label}</Link>}>
        <p>This {kind} no longer exists. It may have been renamed or removed from the library.</p>
      </EmptyState>
    ) : (
      <PageError onRetry={() => group.refetch()} />
    );
  }
  const { group: summary, topTags } = group.data;
  const filtering = hasCriteria(state);

  return (
    <div className={styles.page}>
      <PageHeader
        title={summary.name}
        back={back}
        subtitle={
          filtering && images.data
            ? `${pluralize(images.data.total, 'image')} of ${summary.imageCount}`
            : pluralize(summary.imageCount, 'image')
        }
        hero={<CoverMosaic group={summary} className={styles.hero} />}
        actions={
          <>
            <SelectButton />
            <DensityButtons />
          </>
        }
      >
        <TagFilterRow tags={topTags} state={state} dispatch={dispatch} groupId={id} />
        <div className={styles.controls}>
          <Segmented
            label="Sort"
            value={state.sort}
            options={SORTS}
            onChange={(sort) =>
              dispatch({ type: 'setSort', sort, seed: sort === 'random' ? newSeed() : undefined })
            }
          />
        </div>
      </PageHeader>

      {images.data ? (
        images.data.tiles.length > 0 ? (
          <ImageCollection tiles={images.data.tiles} contextKey={`group-${id}`} primary groupId={id} />
        ) : (
          <EmptyState icon="eyeSlash" title="Nothing to show">
            <p>
              {filtering
                ? emptyResultMessage(state, { groupName: summary.name })
                : 'All images here are hidden by safe mode or haven’t been analyzed yet.'}
            </p>
          </EmptyState>
        )
      ) : (
        <div className={styles.loading}>
          <Spinner />
        </div>
      )}
    </div>
  );
}

function DensityButtons() {
  const { density, setDensity } = usePrefs();
  const level = density ?? defaultDensity(window.innerWidth);
  return (
    <span className={styles.density}>
      <IconButton
        icon="minus"
        label="Smaller thumbnails"
        onClick={() => setDensity(clampDensity(level - 1))}
      />
      <IconButton icon="plus" label="Larger thumbnails" onClick={() => setDensity(clampDensity(level + 1))} />
    </span>
  );
}

/**
 * The group's common tags as one scrolling row; tapping one filters this page in place
 * (tap again to drop it). Tags chosen elsewhere (e.g. from a link) stay visible here.
 */
function TagFilterRow({
  tags,
  state,
  dispatch,
  groupId,
}: {
  tags: TagCount[];
  state: SearchState;
  dispatch: (action: SearchAction) => void;
  groupId: number;
}) {
  const active = new Set(state.include);
  const shown = tags.slice(0, TOP_TAGS_SHOWN);
  const extra = state.include.filter((t) => !shown.some((s) => s.name === t));
  if (shown.length === 0 && extra.length === 0) return null;
  const toggle = (name: string) =>
    dispatch(active.has(name) ? { type: 'remove', tag: name } : { type: 'add', tag: name });
  return (
    <div className={styles.tagRow} role="group" aria-label="Filter by tag">
      {[...extra.map((name) => ({ name, category: 'general' as const, count: undefined })), ...shown].map(
        (tag) => (
          <button
            key={tag.name}
            type="button"
            className={styles.tagChip}
            aria-pressed={active.has(tag.name)}
            onClick={() => toggle(tag.name)}
          >
            <TagPill
              name={tag.name}
              category={tag.category}
              count={tag.count}
              size="sm"
              className={active.has(tag.name) ? styles.tagActive : undefined}
            />
          </button>
        ),
      )}
      <Link
        className={styles.moreTags}
        to={`/search?${searchToParams({ ...EMPTY_SEARCH, include: state.include, group: groupId })}`}
      >
        More…
      </Link>
    </div>
  );
}
