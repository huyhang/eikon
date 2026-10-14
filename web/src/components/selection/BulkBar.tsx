import { useState } from 'react';
import type { BulkEditRequest } from '@eikon/shared';
import { useBulkEdit } from '../../api/hooks';
import { useSelection } from '../../context/Selection';
import { useToasts } from '../../context/Toasts';
import { pluralize } from '../../core/format';
import { Button, IconButton } from '../common/Controls';
import { Sheet } from '../common/Sheet';
import { TagInput } from '../search/TagInput';
import styles from './BulkBar.module.css';

type TagAction = 'add' | 'remove';

/** Actions for the selected images: favourite, tag or untag them all at once. */
export function BulkBar() {
  const { state, dispatch } = useSelection();
  const bulk = useBulkEdit();
  const toasts = useToasts();
  const [tagAction, setTagAction] = useState<TagAction | null>(null);
  if (!state.active) return null;
  const count = state.ids.length;

  const apply = (edit: Omit<BulkEditRequest, 'ids'>, done: (n: number) => string) =>
    bulk.mutate(
      { ids: [...state.ids], ...edit },
      {
        onSuccess: (updated) => toasts.show(done(updated)),
        onError: () => toasts.show('Couldn’t update those images. Try again.', 'error'),
      },
    );

  const applyTag = (tag: string) => {
    if (tagAction === 'add') apply({ addTags: [tag] }, (n) => `Tagged ${pluralize(n, 'image')} “${tag}”`);
    else apply({ removeTags: [tag] }, (n) => `Removed “${tag}” from ${pluralize(n, 'image')}`);
    setTagAction(null);
  };

  return (
    <div className={styles.bar} role="toolbar" aria-label="Selected images">
      <IconButton icon="close" label="Done selecting" onClick={() => dispatch({ type: 'clear' })} />
      <span className={styles.count} aria-live="polite">
        {count ? `${count} selected` : 'Tap images to select'}
      </span>
      <div className={styles.actions}>
        <Button
          icon="heart"
          disabled={!count || bulk.isPending}
          onClick={() => apply({ favorite: true }, (n) => `Added ${pluralize(n, 'image')} to Favorites`)}
        >
          Favorite
        </Button>
        <Button
          disabled={!count || bulk.isPending}
          onClick={() => apply({ favorite: false }, (n) => `Removed ${pluralize(n, 'image')} from Favorites`)}
        >
          Unfavorite
        </Button>
        <Button icon="tag" disabled={!count || bulk.isPending} onClick={() => setTagAction('add')}>
          Add tag
        </Button>
        <Button disabled={!count || bulk.isPending} onClick={() => setTagAction('remove')}>
          Remove tag
        </Button>
      </div>
      <Sheet
        open={tagAction !== null}
        onClose={() => setTagAction(null)}
        title={tagAction === 'add' ? `Add a tag to ${count}` : `Remove a tag from ${count}`}
      >
        <div className={styles.sheetBody}>
          <TagInput
            aria-label={tagAction === 'add' ? 'Tag to add' : 'Tag to remove'}
            placeholder={tagAction === 'add' ? 'Tag, e.g. character:miku' : 'Tag to remove'}
            onSubmit={applyTag}
            autoFocus
          />
        </div>
      </Sheet>
    </div>
  );
}

/** Puts a grid into selection mode. */
export function SelectButton() {
  const { state, dispatch } = useSelection();
  return (
    <IconButton
      icon="checkCircle"
      label={state.active ? 'Done selecting' : 'Select'}
      active={state.active}
      onClick={() => dispatch({ type: state.active ? 'clear' : 'start' })}
    />
  );
}
