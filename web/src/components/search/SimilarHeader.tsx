import { thumbUrl } from '@eikon/shared';
import { Icon } from '../common/Icon';
import styles from './SimilarHeader.module.css';

/** "Images like this one": the reference thumbnail with a way back to a normal search. */
export function SimilarHeader({ imageId, onClear }: { imageId: number; onClear: () => void }) {
  return (
    <div className={styles.card}>
      <img className={styles.thumb} src={thumbUrl({ id: imageId }, 'sm')} alt="The image to match" />
      <div className={styles.text}>
        <span className={styles.title}>More like this</span>
        <span className={styles.detail}>Most similar first</span>
      </div>
      <button type="button" className={styles.clear} onClick={onClear} aria-label="Stop matching this image">
        <Icon name="close" size={14} strokeWidth={2.6} />
      </button>
    </div>
  );
}
