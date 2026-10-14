import { useScan, useStatus } from '../../api/hooks';
import { formatCount } from '../../core/format';
import { LogoMark } from '../layout/Logo';
import { Button } from './Controls';
import styles from './FirstRun.module.css';

/** Welcome screen shown while the library is still empty. */
export function FirstRun() {
  const { data } = useStatus();
  const scan = useScan();
  const scanning = data && data.scan.phase !== 'idle';

  return (
    <div className={styles.firstRun}>
      <div className={styles.glow} aria-hidden="true" />
      <LogoMark size={72} />
      <h1>Welcome to Eikon</h1>
      <p className={styles.lead}>
        Your illustration library will appear here as soon as Eikon finds images in the library folder.
      </p>

      <div className={styles.tree} aria-label="Expected folder layout">
        <div className={styles.line}>
          <span className={styles.folder}>library/</span>
        </div>
        <div className={styles.line}>
          ├─ <span className={styles.folder}>Illustrators/</span>
        </div>
        <div className={styles.line}>
          │ ├─ <span className={styles.folder}>Ilya Kuvshinov/</span>{' '}
          <span className={styles.note}>all their images</span>
        </div>
        <div className={styles.line}>
          │ └─ <span className={styles.folder}>…</span>
        </div>
        <div className={styles.line}>
          └─ <span className={styles.folder}>Collections/</span>
        </div>
        <div className={styles.line}>
          {' '}
          ├─ <span className={styles.folder}>Cozy Rooms/</span>{' '}
          <span className={styles.note}>images from anyone</span>
        </div>
        <div className={styles.line}>
          {' '}
          └─ <span className={styles.folder}>…</span>
        </div>
      </div>

      {scanning ? (
        <div className={styles.progress}>
          <div className={styles.bar}>
            <div
              className={styles.fill}
              style={{ width: `${data.scan.total ? (100 * data.scan.processed) / data.scan.total : 8}%` }}
            />
          </div>
          <span>
            {data.scan.phase === 'walking'
              ? 'Looking for images…'
              : `Processing ${formatCount(data.scan.processed)} of ${formatCount(data.scan.total)}`}
          </span>
        </div>
      ) : (
        <Button variant="primary" icon="refresh" onClick={() => scan.mutate()} disabled={scan.isPending}>
          Scan library now
        </Button>
      )}
      {data?.scan.lastError && <p className={styles.error}>{data.scan.lastError}</p>}
    </div>
  );
}
