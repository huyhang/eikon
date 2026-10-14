import { useState } from 'react';
import clsx from 'clsx';
import type { StatusResponse } from '@eikon/shared';
import { useStatus } from '../../api/hooks';
import { StatusSheet } from '../status/StatusSheet';
import styles from './StatusRing.module.css';

export type RingState = 'hidden' | 'scanning' | 'tagging' | 'offline' | 'failed';

/** What the ring should communicate for a given server status. */
export function ringState(status: StatusResponse | undefined): RingState {
  if (!status) return 'hidden';
  if (status.scan.phase !== 'idle') return 'scanning';
  if (status.tagging.pending > 0) return status.tagging.taggerOnline ? 'tagging' : 'offline';
  if (status.tagging.failed > 0) return 'failed';
  return 'hidden';
}

export function ringProgress(status: StatusResponse): number {
  if (status.scan.phase !== 'idle') return status.scan.total ? status.scan.processed / status.scan.total : 0;
  const { done, total } = status.tagging;
  return total ? done / total : 0;
}

const RADIUS = 9;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function StatusRing({ alwaysVisible = false }: { alwaysVisible?: boolean }) {
  const { data } = useStatus();
  const [open, setOpen] = useState(false);
  const state = ringState(data);
  if (!data || (state === 'hidden' && !alwaysVisible)) return null;
  const progress = ringProgress(data);
  const label =
    state === 'scanning'
      ? `Scanning ${data.scan.processed} of ${data.scan.total}`
      : state === 'tagging'
        ? `Tagging ${data.tagging.done} of ${data.tagging.total}`
        : state === 'offline'
          ? 'Tagger offline'
          : state === 'failed'
            ? `${data.tagging.failed} images failed tagging`
            : 'Library status';

  return (
    <>
      <button
        type="button"
        className={clsx(styles.ring, styles[state])}
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
      >
        <svg viewBox="0 0 24 24" width="24" height="24">
          <circle cx="12" cy="12" r={RADIUS} className={styles.track} />
          <circle
            cx="12"
            cy="12"
            r={RADIUS}
            className={styles.progress}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          />
        </svg>
        {(state === 'offline' || state === 'failed') && <span className={styles.dot} />}
      </button>
      <StatusSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
