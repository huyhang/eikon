import { useState } from 'react';
import type { ImageSort } from '@eikon/shared';
import { useImages } from '../api/hooks';
import { useNewSeed } from '../context/Dependencies';
import { pluralize } from '../core/format';
import { Segmented, Spinner } from '../components/common/Controls';
import { ImageCollection } from '../components/grid/ImageCollection';
import { PageHeader } from '../components/layout/PageHeader';
import { SORTS } from '../components/search/SearchFilters';
import styles from './AllImagesPage.module.css';

/** The whole library in one grid (kept off the home page so it stays short). */
export function AllImagesPage() {
  const [sort, setSort] = useState<ImageSort>('newest');
  const newSeed = useNewSeed();
  const [seed, setSeed] = useState(newSeed);
  const images = useImages({ sort, ...(sort === 'random' ? { seed } : {}) });

  const changeSort = (next: ImageSort) => {
    if (next === 'random') setSeed(newSeed());
    setSort(next);
  };

  return (
    <div className={styles.page}>
      <PageHeader
        title="All Images"
        back={{ to: '/', label: 'Library' }}
        subtitle={images.data ? pluralize(images.data.total, 'image') : undefined}
      >
        <div className={styles.controls}>
          <Segmented label="Sort" value={sort} options={SORTS} onChange={changeSort} />
        </div>
      </PageHeader>
      {images.data ? (
        <ImageCollection tiles={images.data.tiles} contextKey="all" primary />
      ) : (
        <div className={styles.loading}>
          <Spinner />
        </div>
      )}
    </div>
  );
}
