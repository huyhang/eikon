import { useEffect, useState } from 'react';
import type { ImageDetail } from '@eikon/shared';
import { useMarkAllReviewed, useMarkReviewed, useReviewQueue } from '../api/hooks';
import { useDependencies } from '../context/Dependencies';
import { formatCount, pluralize } from '../core/format';
import { Button, Spinner } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { PageHeader } from '../components/layout/PageHeader';
import { ReviewCard } from '../components/review/ReviewCard';
import styles from './ReviewPage.module.css';

/** Keys that move through the queue without leaving the keyboard. */
export function reviewKeyAction(key: string): 'confirm' | 'skip' | null {
  if (key === 'Enter' || key === 'ArrowRight') return 'confirm';
  if (key === 's' || key === 'ArrowDown') return 'skip';
  return null;
}

/**
 * The tag review queue: newly tagged images one at a time. Fix what the tagger got wrong (or add what
 * it missed), then confirm; skipped images come back next time.
 */
export function ReviewPage() {
  const queue = useReviewQueue(20);
  const markReviewed = useMarkReviewed();
  const markAll = useMarkAllReviewed();
  const { confirm } = useDependencies();
  const [skipped, setSkipped] = useState<ReadonlySet<number>>(new Set());
  const current: ImageDetail | undefined = queue.data?.images.find((d) => !skipped.has(d.id));
  const remaining = Math.max(0, (queue.data?.total ?? 0) - skipped.size);

  const confirmCurrent = () => current && markReviewed.mutate(current.id);
  const skipCurrent = () => current && setSkipped(new Set([...skipped, current.id]));
  const clearBacklog = () => {
    if (confirm(`Mark all ${formatCount(remaining)} images as reviewed?`)) markAll.mutate();
  };

  useReviewKeys(confirmCurrent, skipCurrent);

  return (
    <div className={styles.page}>
      <PageHeader
        title="Review Tags"
        subtitle={queue.data ? `${pluralize(remaining, 'image')} to review` : undefined}
        actions={
          remaining > 1 ? (
            <Button onClick={clearBacklog} disabled={markAll.isPending}>
              Mark all reviewed
            </Button>
          ) : undefined
        }
      />
      {!queue.data ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : current ? (
        <ReviewCard
          key={current.id}
          detail={current}
          onConfirm={confirmCurrent}
          onSkip={skipCurrent}
          busy={markReviewed.isPending}
        />
      ) : (
        <EmptyState icon="checkCircle" title="All caught up">
          <p>New images appear here once gpubox has tagged them.</p>
        </EmptyState>
      )}
    </div>
  );
}

function useReviewKeys(onConfirm: () => void, onSkip: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey)
        return;
      const action = reviewKeyAction(e.key);
      if (action === 'confirm') onConfirm();
      if (action === 'skip') onSkip();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onConfirm, onSkip]);
}
