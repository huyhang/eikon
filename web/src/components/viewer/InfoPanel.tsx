import { Link } from 'react-router';
import { motion, type PanInfo } from 'motion/react';
import { RATINGS, thumbUrl, type ImageDetail, type Rating } from '@eikon/shared';
import { useSetRating, useSimilarImages } from '../../api/hooks';
import { formatBytes, formatDate, formatDimensions } from '../../core/format';
import { INFO_PANEL_WIDTH } from '../../core/viewerLayout';
import { RATING_LABELS } from '../../core/safeMode';
import { Spinner } from '../common/Controls';
import { Icon } from '../common/Icon';
import { groupPath } from '../layout/navigation';
import { TagEditor } from './TagEditor';
import styles from './InfoPanel.module.css';

interface InfoPanelProps {
  detail: ImageDetail | undefined;
  wide: boolean;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onClose: () => void;
  onSearch: (tag: string) => void;
  onAddToSearch: (tag: string) => void;
  /** Shows a "More like this" strip when similar-image search is available. */
  similar: boolean;
  /** Height of the phone sheet; the picture moves into the space above it. */
  sheetHeight?: number;
}

export function InfoPanel({ detail, wide, onClose, sheetHeight, ...tagProps }: InfoPanelProps) {
  const content = detail ? (
    <InfoContent detail={detail} {...tagProps} />
  ) : (
    <div className={styles.loading}>
      <Spinner />
    </div>
  );

  if (wide) {
    return (
      <motion.aside
        className={styles.side}
        style={{ width: INFO_PANEL_WIDTH }}
        initial={{ x: INFO_PANEL_WIDTH, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: INFO_PANEL_WIDTH, opacity: 0 }}
        transition={{ type: 'spring', damping: 34, stiffness: 320 }}
        data-no-swipe
      >
        <header className={styles.sideHeader}>
          <h2>Info</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close info">
            <Icon name="close" size={15} strokeWidth={2.4} />
          </button>
        </header>
        <div className={styles.scroll}>{content}</div>
      </motion.aside>
    );
  }

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) onClose();
  };

  return (
    <motion.aside
      className={styles.sheet}
      style={sheetHeight ? { height: sheetHeight } : undefined}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 32, stiffness: 320 }}
      drag="y"
      dragConstraints={{ top: 0, bottom: 0 }}
      dragElastic={{ top: 0, bottom: 0.7 }}
      onDragEnd={onDragEnd}
      data-no-swipe
    >
      <div className={styles.grabber} />
      <div className={styles.scroll}>{content}</div>
    </motion.aside>
  );
}

const unique = <T extends { id: number }>(list: T[]) => [...new Map(list.map((g) => [g.id, g])).values()];

function InfoContent({
  detail,
  editing,
  onEditingChange,
  onSearch,
  onAddToSearch,
  similar,
}: { detail: ImageDetail } & Omit<InfoPanelProps, 'detail' | 'wide' | 'onClose'>) {
  const illustrators = detail.files.filter((f) => f.group.kind === 'illustrator').map((f) => f.group);
  const collections = detail.files.filter((f) => f.group.kind === 'collection').map((f) => f.group);

  return (
    <div className={styles.content}>
      <section className={styles.byline}>
        {unique(illustrators).map((g) => (
          <Link key={g.id} to={groupPath('illustrator', g.id)} className={styles.artist}>
            <Icon name="illustrators" size={18} />
            <span>{g.name}</span>
            <Icon name="chevronRight" size={15} className={styles.chev} />
          </Link>
        ))}
        <p className={styles.date}>Added {formatDate(detail.addedAt)}</p>
      </section>

      {collections.length > 0 && (
        <section>
          <h3 className={styles.sectionTitle}>In collections</h3>
          <div className={styles.collections}>
            {unique(collections).map((g) => (
              <Link key={g.id} to={groupPath('collection', g.id)} className={styles.collection}>
                <Icon name="collections" size={15} />
                {g.name}
              </Link>
            ))}
          </div>
        </section>
      )}

      <TagEditor
        detail={detail}
        editing={editing}
        onEditingChange={onEditingChange}
        onSearch={onSearch}
        onAddToSearch={onAddToSearch}
      />

      {similar && <MoreLikeThis imageId={detail.id} />}

      <section>
        <h3 className={styles.sectionTitle}>Details</h3>
        <dl className={styles.details}>
          <dt>Dimensions</dt>
          <dd>{formatDimensions(detail.width, detail.height)}</dd>
          <dt>Size</dt>
          <dd>{formatBytes(detail.sizeBytes)}</dd>
          <dt>Format</dt>
          <dd>
            {detail.format.toUpperCase()}
            {detail.animated ? ' · animated' : ''}
          </dd>
          <dt>Rating</dt>
          <dd>
            <RatingControl detail={detail} />
          </dd>
          {detail.files.map((f) => (
            <FileRow key={f.path} path={f.path} />
          ))}
        </dl>
      </section>
    </div>
  );
}

function FileRow({ path }: { path: string }) {
  return (
    <>
      <dt>File</dt>
      <dd className={styles.path} title={path}>
        {path}
      </dd>
    </>
  );
}

const AUTO = 'auto';

/** The tagger's rating, or the user's override; the override survives re-tagging and drives safe mode. */
function RatingControl({ detail }: { detail: ImageDetail }) {
  const setRating = useSetRating(detail.id);
  const automatic =
    detail.rating && !detail.ratingOverridden ? `Automatic (${RATING_LABELS[detail.rating]})` : 'Automatic';
  return (
    <select
      className={styles.ratingSelect}
      value={detail.ratingOverridden && detail.rating ? detail.rating : AUTO}
      onChange={(e) => setRating.mutate(e.target.value === AUTO ? null : (e.target.value as Rating))}
      disabled={setRating.isPending}
      aria-label="Rating"
    >
      <option value={AUTO}>{automatic}</option>
      {RATINGS.map((r) => (
        <option key={r} value={r}>
          {RATING_LABELS[r]}
        </option>
      ))}
    </select>
  );
}

const SIMILAR_STRIP = 8;
const SKELETON = [0, 1, 2, 3];

/** A few look-alikes; each opens inside the full "more like this" results. */
function MoreLikeThis({ imageId }: { imageId: number }) {
  const similar = useSimilarImages(imageId, SIMILAR_STRIP, true);
  const tiles = similar.data?.tiles ?? [];
  if (similar.isError || (similar.data && tiles.length === 0)) return null;
  return (
    <section>
      <header className={styles.sectionHeader}>
        <h3 className={styles.sectionTitle}>More like this</h3>
        <Link to={`/search?like=${imageId}`} className={styles.seeAll}>
          See all
        </Link>
      </header>
      <div className={styles.similarStrip}>
        {similar.data
          ? tiles.map((tile) => (
              <Link
                key={tile.id}
                to={`/search?like=${imageId}&img=${tile.id}`}
                className={styles.similarTile}
              >
                <img src={thumbUrl(tile, 'sm')} alt="" loading="lazy" />
              </Link>
            ))
          : SKELETON.map((position) => <span key={position} className={styles.similarTile} />)}
      </div>
    </section>
  );
}
