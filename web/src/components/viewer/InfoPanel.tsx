import { Link } from 'react-router';
import { motion, type PanInfo } from 'motion/react';
import type { ImageDetail } from '@eikon/shared';
import { formatBytes, formatDate, formatDimensions } from '../../core/format';
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
}

export const INFO_PANEL_WIDTH = 380;

export function InfoPanel({ detail, wide, onClose, ...tagProps }: InfoPanelProps) {
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

function InfoContent({
  detail,
  editing,
  onEditingChange,
  onSearch,
  onAddToSearch,
}: { detail: ImageDetail } & Omit<InfoPanelProps, 'detail' | 'wide' | 'onClose'>) {
  const illustrators = detail.files.filter((f) => f.group.kind === 'illustrator').map((f) => f.group);
  const collections = detail.files.filter((f) => f.group.kind === 'collection').map((f) => f.group);
  const unique = <T extends { id: number }>(list: T[]) => [...new Map(list.map((g) => [g.id, g])).values()];

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
          {detail.rating && (
            <>
              <dt>Rating</dt>
              <dd>{RATING_LABELS[detail.rating]}</dd>
            </>
          )}
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
