import { formatDimensions, pluralize } from '../core/format';
import { useDuplicates, useSettings, useUpdateSettings } from '../api/hooks';
import { Spinner, Switch } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { ImageCollection } from '../components/grid/ImageCollection';
import { PageHeader } from '../components/layout/PageHeader';
import styles from './DuplicatesPage.module.css';

/** Pictures that exist more than once (resized or re-compressed copies), best copy first. */
export function DuplicatesPage() {
  const duplicates = useDuplicates();
  const settings = useSettings();
  const update = useUpdateSettings();
  const clusters = duplicates.data ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        title="Duplicates"
        back={{ to: '/settings', label: 'Settings' }}
        subtitle={
          duplicates.data ? pluralize(clusters.length, 'picture') + ' with smaller copies' : undefined
        }
      >
        {settings.data && (
          <label className={styles.toggle}>
            <span>
              <strong>Hide smaller copies in grids</strong>
              <span className={styles.detail}>
                A smaller copy disappears only where its best copy is shown too.
              </span>
            </span>
            <Switch
              label="Hide smaller copies in grids"
              checked={settings.data.hideDuplicates}
              onChange={(hideDuplicates) => update.mutate({ hideDuplicates })}
            />
          </label>
        )}
      </PageHeader>

      {!duplicates.data ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : clusters.length === 0 ? (
        <EmptyState icon="copies" title="No duplicates">
          <p>Eikon looks for resized or re-compressed copies of the same picture after every scan.</p>
        </EmptyState>
      ) : (
        <ul className={styles.clusters}>
          {clusters.map(({ best, copies }) => (
            <li key={best.id} className={styles.cluster}>
              <p className={styles.caption}>
                Best copy {formatDimensions(best.width, best.height)} ·{' '}
                {copies.map((c) => formatDimensions(c.width, c.height)).join(', ')}
              </p>
              <ImageCollection tiles={[best, ...copies]} contextKey={`dup-${best.id}`} maxRows={1} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
