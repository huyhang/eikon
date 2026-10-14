import type { ImageDetail, ImageTag } from '@eikon/shared';
import { useAddTag, useRemoveTag } from '../../api/hooks';
import clsx from 'clsx';
import { confidencePercent, groupTagsByCategory, isFaint, tagOrigin } from '../../core/tagGroups';
import { useLongPress } from '../../hooks/useLongPress';
import { Icon } from '../common/Icon';
import { TagInput } from '../search/TagInput';
import { TagPill } from '../search/TagPill';
import styles from './TagEditor.module.css';

interface TagEditorProps {
  detail: ImageDetail;
  editing: boolean;
  /** Absent when the editor is always in edit mode (the review queue). */
  onEditingChange?: (editing: boolean) => void;
  /** Tap: start a new search for this tag. */
  onSearch: (tag: string) => void;
  /** Long-press: add this tag to the current search. */
  onAddToSearch: (tag: string) => void;
}

export function TagEditor({ detail, editing, onEditingChange, onSearch, onAddToSearch }: TagEditorProps) {
  const add = useAddTag(detail.id);
  const remove = useRemoveTag(detail.id);
  const groups = groupTagsByCategory(detail.tags);

  return (
    <section className={styles.editor} aria-label="Tags">
      <header className={styles.header}>
        <h3>Tags</h3>
        {onEditingChange && (
          <button type="button" className={styles.editToggle} onClick={() => onEditingChange(!editing)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </header>

      {detail.tagStatus === 'pending' && detail.tags.length === 0 && (
        <p className={styles.pending}>
          <span className={styles.shimmer} />
          Analyzing on gpubox…
        </p>
      )}
      {detail.tagStatus === 'failed' && detail.tags.length === 0 && (
        <p className={styles.muted}>Tagging failed for this image. You can retry from Library status.</p>
      )}
      {detail.tagStatus === 'done' && detail.tags.length === 0 && !editing && (
        <p className={styles.muted}>No tags yet.</p>
      )}

      {groups.map((group) => (
        <div key={group.category} className={styles.group}>
          <h4>{group.label}</h4>
          <ul className={styles.tags}>
            {group.tags.map((tag) => (
              <li key={tag.name}>
                {editing ? (
                  <EditableTag tag={tag} onRemove={() => remove.mutate(tag.name)} />
                ) : (
                  <InteractiveTag tag={tag} onSearch={onSearch} onAddToSearch={onAddToSearch} />
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {editing && (
        <div className={styles.addRow}>
          <Icon name="plus" size={16} />
          <TagInput
            aria-label="Add tag"
            placeholder="Add a tag, e.g. character:miku"
            hide={detail.tags.map((t) => t.name)}
            onSubmit={(text) => add.mutate(text)}
            autoFocus
          />
        </div>
      )}
      {(add.isError || remove.isError) && (
        <p className={styles.error}>Couldn’t save that change. Try again.</p>
      )}
    </section>
  );
}

function InteractiveTag({
  tag,
  onSearch,
  onAddToSearch,
}: {
  tag: ImageTag;
  onSearch: (tag: string) => void;
  onAddToSearch: (tag: string) => void;
}) {
  const handlers = useLongPress(
    () => onSearch(tag.name),
    () => onAddToSearch(tag.name),
  );
  return (
    <button
      type="button"
      className={clsx(styles.tagButton, isFaint(tag) && styles.faint)}
      title={`${tag.name} · ${tagOrigin(tag)}`}
      {...handlers}
    >
      <TagPill
        name={tag.name}
        category={tag.category}
        manual={tag.source === 'manual'}
        size="sm"
        className={tag.source === 'implied' ? styles.implied : undefined}
      />
    </button>
  );
}

/** In edit mode the confidence is written out, so it can be judged on touch screens too. */
function EditableTag({ tag, onRemove }: { tag: ImageTag; onRemove: () => void }) {
  const percent = confidencePercent(tag);
  return (
    <button
      type="button"
      className={clsx(styles.tagButton, isFaint(tag) && styles.faint)}
      onClick={onRemove}
      aria-label={`Remove ${tag.name} (${tagOrigin(tag)})`}
    >
      <TagPill
        name={tag.name}
        category={tag.category}
        manual={tag.source === 'manual'}
        size="sm"
        className={clsx(styles.removable, tag.source === 'implied' && styles.implied)}
        trailing={
          <>
            {percent && <span className={styles.percent}>{percent}</span>}
            <Icon name="close" size={11} strokeWidth={2.6} />
          </>
        }
      />
    </button>
  );
}
