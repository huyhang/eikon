import { useState } from 'react';
import { Link, useParams } from 'react-router';
import type { GroupKind, ImageSort } from '@eikon/shared';
import { useGroup, useImages } from '../api/hooks';
import { usePrefs } from '../context/Prefs';
import { pluralize } from '../core/format';
import { clampDensity, defaultDensity } from '../core/gestures';
import { isNotFound } from '../api/client';
import { searchToParams, EMPTY_SEARCH } from '../core/searchState';
import { IconButton, Segmented, Spinner } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { ImageCollection } from '../components/grid/ImageCollection';
import { CoverMosaic } from '../components/groups/GroupCard';
import { PageHeader } from '../components/layout/PageHeader';
import { TagPill } from '../components/search/TagPill';
import { PageError, PageLoading } from './PageStates';
import styles from './GroupPage.module.css';

const SORTS: { value: ImageSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'random', label: 'Shuffle' },
];

export function GroupPage({ kind }: { kind: GroupKind }) {
  const id = Number(useParams().id);
  const [sort, setSort] = useState<ImageSort>('newest');
  const [seed] = useState(() => Math.floor(Math.random() * 1_000_000));
  const group = useGroup(id);
  const images = useImages({ group: id, sort, ...(sort === 'random' ? { seed } : {}) }, Number.isInteger(id));
  const { density, setDensity } = usePrefs();
  const level = density ?? defaultDensity(window.innerWidth);
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

  return (
    <div className={styles.page}>
      <PageHeader
        title={summary.name}
        back={back}
        subtitle={pluralize(summary.imageCount, 'image')}
        hero={<CoverMosaic group={summary} className={styles.hero} />}
        actions={
          <span className={styles.density}>
            <IconButton
              icon="minus"
              label="Smaller thumbnails"
              onClick={() => setDensity(clampDensity(level - 1))}
            />
            <IconButton
              icon="plus"
              label="Larger thumbnails"
              onClick={() => setDensity(clampDensity(level + 1))}
            />
          </span>
        }
      >
        {topTags.length > 0 && (
          <ul className={styles.tags} aria-label="Common tags">
            {topTags.slice(0, 14).map((tag) => (
              <li key={tag.name}>
                <Link to={`/search?${searchToParams({ ...EMPTY_SEARCH, include: [tag.name], group: id })}`}>
                  <TagPill name={tag.name} category={tag.category} count={tag.count} size="sm" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.controls}>
          <Segmented label="Sort" value={sort} options={SORTS} onChange={setSort} />
        </div>
      </PageHeader>

      {images.data ? (
        images.data.tiles.length > 0 ? (
          <ImageCollection tiles={images.data.tiles} contextKey={`group-${id}`} primary groupId={id} />
        ) : (
          <EmptyState icon="eyeSlash" title="Nothing to show">
            <p>All images here are hidden by safe mode or haven’t been analyzed yet.</p>
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
