import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useHome, useStatus } from '../api/hooks';
import { formatCount, pluralize } from '../core/format';
import { FirstRun } from '../components/common/FirstRun';
import { Icon } from '../components/common/Icon';
import { Section } from '../components/common/Section';
import { ImageCollection } from '../components/grid/ImageCollection';
import { GroupCard } from '../components/groups/GroupCard';
import { HorizontalRow } from '../components/groups/HorizontalRow';
import { PageHeader } from '../components/layout/PageHeader';
import { usePrefs } from '../context/Prefs';
import { PageError, PageLoading } from './PageStates';
import styles from './LibraryPage.module.css';

export function LibraryPage() {
  const home = useHome();
  const reviewPending = useStatus().data?.review.pending ?? 0;
  const client = useQueryClient();
  const { collapsedSections, toggleSection } = usePrefs();
  const collapse = (key: string) => ({
    collapsed: collapsedSections.includes(key),
    onToggle: () => toggleSection(key),
  });

  if (home.isPending) return <PageLoading />;
  if (home.isError) return <PageError onRetry={() => home.refetch()} />;
  const { recent, illustrators, collections, rediscover, totals } = home.data;
  if (totals.images === 0) return <FirstRun />;

  const subtitle = [
    pluralize(totals.images, 'image'),
    pluralize(totals.illustrators, 'illustrator'),
    pluralize(totals.collections, 'collection'),
  ].join(' · ');

  return (
    <div className={styles.page}>
      <PageHeader title="Library" subtitle={subtitle}>
        <div className={styles.quickLinks}>
          <Link to="/favorites" className={styles.quickLink}>
            <Icon name="heart" size={17} filled />
            Favorites
          </Link>
          <Link to="/search" className={styles.quickLink}>
            <Icon name="search" size={17} />
            Search
          </Link>
          {reviewPending > 0 && (
            <Link to="/review" className={styles.quickLink}>
              <Icon name="checkCircle" size={17} />
              Review {formatCount(reviewPending)}
            </Link>
          )}
        </div>
      </PageHeader>

      {recent.length > 0 && (
        <Section title="Recently Added" flush collapse={collapse('home.recent')}>
          <ImageCollection tiles={recent} contextKey="recent" variant="strip" />
        </Section>
      )}

      {illustrators.length > 0 && (
        <Section title="Illustrators" seeAll="/illustrators" flush collapse={collapse('home.illustrators')}>
          <HorizontalRow>
            {illustrators.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </HorizontalRow>
        </Section>
      )}

      {collections.length > 0 && (
        <Section title="Collections" seeAll="/collections" flush collapse={collapse('home.collections')}>
          <HorizontalRow>
            {collections.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </HorizontalRow>
        </Section>
      )}

      {rediscover.length > 0 && (
        <Section
          flush
          title="Rediscover"
          collapse={collapse('home.rediscover')}
          action={
            <button
              type="button"
              className={styles.shuffle}
              onClick={() => client.invalidateQueries({ queryKey: ['home'] })}
              aria-label="Shuffle"
            >
              <Icon name="shuffle" size={18} />
              Shuffle
            </button>
          }
        >
          <ImageCollection tiles={rediscover} contextKey="rediscover" maxRows={2} />
        </Section>
      )}

      <Link to="/all" className={styles.allImages}>
        <span className={styles.allTitle}>All Images</span>
        <span className={styles.count}>{formatCount(totals.images)}</span>
        <Icon name="chevronRight" size={18} strokeWidth={2.4} />
      </Link>
    </div>
  );
}
