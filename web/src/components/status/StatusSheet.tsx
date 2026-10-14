import { useFailedImages, useRetryFailed, useScan, useStatus } from '../../api/hooks';
import { formatCount, formatPercent, formatRelative } from '../../core/format';
import { useDependencies } from '../../context/Dependencies';
import { Button, Spinner } from '../common/Controls';
import { Icon } from '../common/Icon';
import { ProgressiveImage } from '../common/ProgressiveImage';
import { Sheet } from '../common/Sheet';
import styles from './StatusSheet.module.css';

const SCAN_LABELS = {
  idle: 'Up to date',
  walking: 'Looking for new images…',
  processing: 'Processing images…',
  cleaning: 'Tidying up…',
} as const;

export function StatusSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useStatus();
  const { now } = useDependencies();
  const failed = useFailedImages(open && (data?.tagging.failed ?? 0) > 0);
  const scan = useScan();
  const retry = useRetryFailed();

  return (
    <Sheet open={open} onClose={onClose} title="Library status">
      {!data ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : (
        <div className={styles.content}>
          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Icon name="folder" size={18} />
              <h3>Library</h3>
            </div>
            <p className={styles.headline}>{SCAN_LABELS[data.scan.phase]}</p>
            {data.scan.phase !== 'idle' && data.scan.total > 0 && (
              <Progress
                value={data.scan.processed / data.scan.total}
                label={`${formatCount(data.scan.processed)} of ${formatCount(data.scan.total)}`}
              />
            )}
            <p className={styles.meta}>
              {data.scan.lastScanAt
                ? `Last scanned ${formatRelative(data.scan.lastScanAt, now())}`
                : 'Not scanned yet'}
            </p>
            {data.scan.lastError && <p className={styles.error}>{data.scan.lastError}</p>}
            <Button
              icon="refresh"
              onClick={() => scan.mutate()}
              disabled={scan.isPending || data.scan.phase !== 'idle'}
            >
              Rescan now
            </Button>
          </section>

          <section className={styles.card}>
            <div className={styles.cardHeader}>
              <Icon name="sparkles" size={18} />
              <h3>Tagging</h3>
              <span className={data.tagging.taggerOnline ? styles.online : styles.offline}>
                {data.tagging.taggerOnline ? 'gpubox online' : 'gpubox offline'}
              </span>
            </div>
            <Progress
              value={data.tagging.total ? data.tagging.done / data.tagging.total : 1}
              label={`${formatCount(data.tagging.done)} of ${formatCount(data.tagging.total)} tagged`}
            />
            <dl className={styles.stats}>
              <Stat label="Waiting" value={data.tagging.pending} />
              <Stat label="Done" value={data.tagging.done} />
              <Stat
                label="Failed"
                value={data.tagging.failed}
                tone={data.tagging.failed ? 'danger' : undefined}
              />
            </dl>
            {data.tagging.taggerModel && <p className={styles.meta}>Model: {data.tagging.taggerModel}</p>}
            {!data.tagging.taggerOnline && data.tagging.pending > 0 && (
              <p className={styles.meta}>Tagging will resume automatically when gpubox is back online.</p>
            )}
          </section>

          {data.tagging.failed > 0 && (
            <section className={styles.card}>
              <div className={styles.cardHeader}>
                <Icon name="info" size={18} />
                <h3>Failed images</h3>
              </div>
              <ul className={styles.failedList}>
                {(failed.data ?? []).slice(0, 50).map((item) => (
                  <li key={item.tile.id}>
                    <div className={styles.failedThumb}>
                      <ProgressiveImage tile={item.tile} />
                    </div>
                    <div>
                      <p className={styles.failedError}>{item.error}</p>
                      <p className={styles.meta}>{item.attempts} attempts</p>
                    </div>
                  </li>
                ))}
              </ul>
              <Button
                icon="refresh"
                variant="primary"
                onClick={() => retry.mutate()}
                disabled={retry.isPending}
              >
                Retry failed
              </Button>
            </section>
          )}
        </div>
      )}
    </Sheet>
  );
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className={styles.progress}>
      <div
        className={styles.bar}
        role="progressbar"
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={styles.fill} style={{ width: formatPercent(value) }} />
      </div>
      <span>{label}</span>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: 'danger' }) {
  return (
    <div className={styles.stat}>
      <dt>{label}</dt>
      <dd className={tone === 'danger' ? styles.danger : undefined}>{formatCount(value)}</dd>
    </div>
  );
}
