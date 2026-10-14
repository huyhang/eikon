import { thumbUrl, type ImageDetail } from '@eikon/shared';
import { altTextFor } from '../../core/altText';
import { Button } from '../common/Controls';
import { TagEditor } from '../viewer/TagEditor';
import styles from './ReviewCard.module.css';

interface ReviewCardProps {
  detail: ImageDetail;
  onConfirm: () => void;
  onSkip: () => void;
  busy: boolean;
}

/** One image to review: the picture beside its tags, always editable. */
const noop = () => {};

export function ReviewCard({ detail, onConfirm, onSkip, busy }: ReviewCardProps) {
  return (
    <div className={styles.card}>
      <div className={styles.imageWrap}>
        <img
          className={styles.image}
          src={thumbUrl(detail.id, 'lg')}
          alt={altTextFor(detail)}
          style={{ aspectRatio: `${detail.width} / ${detail.height}` }}
        />
      </div>
      <div className={styles.side}>
        <TagEditor detail={detail} editing onSearch={noop} onAddToSearch={noop} />
        <div className={styles.actions}>
          <Button variant="primary" icon="check" onClick={onConfirm} disabled={busy}>
            Looks right
          </Button>
          <Button onClick={onSkip}>Skip</Button>
        </div>
        <p className={styles.hint}>Tap a tag to remove it. Enter confirms, S skips.</p>
      </div>
    </div>
  );
}
