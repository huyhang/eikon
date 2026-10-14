import { Link } from 'react-router';
import { useImages, useSavedSearches } from '../api/hooks';
import { pluralize } from '../core/format';
import { Spinner } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { Icon } from '../components/common/Icon';
import { Section } from '../components/common/Section';
import { ImageCollection } from '../components/grid/ImageCollection';
import { PageHeader } from '../components/layout/PageHeader';
import { PinnedSearchList } from '../components/search/PinnedSearchList';
import styles from './SavedPage.module.css';

/** The phone tab for everything kept on purpose: pinned searches and favourites. */
export function SavedPage() {
  const pinned = useSavedSearches();
  const favorites = useImages({ favorites: true });
  const pinnedCount = pinned.data?.length ?? 0;
  const favoriteCount = favorites.data?.total ?? 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Saved"
        subtitle={
          pinned.data && favorites.data
            ? `${pluralize(pinnedCount, 'pinned search', 'pinned searches')} · ${pluralize(favoriteCount, 'favorite')}`
            : undefined
        }
      />

      <Section title="Pinned Searches" flush>
        {pinnedCount > 0 ? (
          <PinnedSearchList variant="cards" />
        ) : (
          <p className={styles.hint}>
            Tap <Icon name="star" size={15} /> on a search to pin it here.
          </p>
        )}
      </Section>

      <Section
        title="Favorites"
        flush
        action={
          favoriteCount > 0 ? (
            <Link to="/favorites" className={styles.filter}>
              Filter by tag
            </Link>
          ) : undefined
        }
      >
        {!favorites.data ? (
          <div className={styles.loading}>
            <Spinner />
          </div>
        ) : favoriteCount === 0 ? (
          <EmptyState icon="heart" title="No favorites yet">
            <p>Tap ♥ while viewing any image and it will show up here, on every device.</p>
          </EmptyState>
        ) : (
          <ImageCollection tiles={favorites.data.tiles} contextKey="saved" primary />
        )}
      </Section>
    </div>
  );
}
