import { useMemo } from 'react';
import { useImages } from '../api/hooks';
import { pluralize } from '../core/format';
import { emptyResultMessage, hasCriteria, searchToImageQuery } from '../core/searchState';
import { Spinner } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { ImageCollection } from '../components/grid/ImageCollection';
import { PageHeader } from '../components/layout/PageHeader';
import { SearchBar } from '../components/search/SearchBar';
import { SelectButton } from '../components/selection/BulkBar';
import { useSearchUrlState } from '../hooks/useSearchUrlState';
import styles from './FavoritesPage.module.css';

export function FavoritesPage() {
  const [state, dispatch] = useSearchUrlState();
  const query = useMemo(() => ({ ...searchToImageQuery(state), favorites: true }), [state]);
  const results = useImages(query);
  const filtering = hasCriteria(state);
  const total = results.data?.total ?? 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Favorites"
        subtitle={results.data ? pluralize(total, 'favorite') : undefined}
        actions={total > 0 ? <SelectButton /> : undefined}
      >
        {(total > 0 || filtering) && (
          <div className={styles.search}>
            <SearchBar state={state} dispatch={dispatch} placeholder="Filter favorites by tag" />
          </div>
        )}
      </PageHeader>
      {!results.data ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : results.data.tiles.length === 0 ? (
        filtering ? (
          <EmptyState icon="search" title="No matching favorites">
            <p>{emptyResultMessage(state, { noun: 'favorites' })}</p>
          </EmptyState>
        ) : (
          <EmptyState icon="heart" title="No favorites yet">
            <p>Tap ♥ while viewing any image and it will show up here, on every device.</p>
          </EmptyState>
        )
      ) : (
        <ImageCollection tiles={results.data.tiles} contextKey="favorites" primary />
      )}
    </div>
  );
}
