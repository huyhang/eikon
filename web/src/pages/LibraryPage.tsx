import { Link } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useHome, useImages } from '../api/hooks';
import { formatCount, pluralize } from '../core/format';
import { Spinner } from '../components/common/Controls';
import { FirstRun } from '../components/common/FirstRun';
import { Icon } from '../components/common/Icon';
import { Section } from '../components/common/Section';
import { ImageCollection } from '../components/grid/ImageCollection';
import { GroupCard } from '../components/groups/GroupCard';
import { HorizontalRow } from '../components/groups/HorizontalRow';
import { PageHeader } from '../components/layout/PageHeader';
import { PageError, PageLoading } from './PageStates';
import styles from './LibraryPage.module.css';

export function LibraryPage() {
  const home = useHome();
  const all = useImages({ sort: 'newest' }, (home.data?.totals.images ?? 0) > 0);
  const client = useQueryClient();

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
            Search tags
          </Link>
        </div>
      </PageHeader>

      {recent.length > 0 && (
        <Section title="Recently Added" flush>
          <ImageCollection tiles={recent} contextKey="recent" variant="strip" />
        </Section>
      )}

      {illustrators.length > 0 && (
        <Section title="Illustrators" seeAll="/illustrators" flush>
          <HorizontalRow>
            {illustrators.map((g) => (
              <GroupCard key={g.id} group={g} />
            ))}
          </HorizontalRow>
        </Section>
      )}

      {collections.length > 0 && (
        <Section title="Collections" seeAll="/collections" flush>
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

      <Section
        flush
        title="All Images"
        action={<span className={styles.count}>{formatCount(totals.images)}</span>}
      >
        {all.data ? (
          <ImageCollection tiles={all.data.tiles} contextKey="all" primary />
        ) : (
          <div className={styles.loading}>
            <Spinner />
          </div>
        )}
      </Section>
    </div>
  );
}
