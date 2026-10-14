import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import {
  displayTagName,
  normalizeTagName,
  TAG_CATEGORIES,
  type TagCategory,
  type TagInfo,
} from '@eikon/shared';
import { ApiRequestError } from '../../api/client';
import { useTagEdit, useTagInfo } from '../../api/hooks';
import { useApi } from '../../context/Dependencies';
import { CATEGORY_LABELS } from '../../core/tagGroups';
import { EMPTY_SEARCH, searchToParams } from '../../core/searchState';
import { Button, Spinner } from '../common/Controls';
import { Icon } from '../common/Icon';
import { Sheet } from '../common/Sheet';
import { TagInput } from '../search/TagInput';
import { TagPill } from '../search/TagPill';
import styles from './TagDetailSheet.module.css';

interface TagDetailSheetProps {
  name: string | null;
  onClose: () => void;
  /** A rename (or merge) changes which tag the sheet shows. */
  onRenamed: (name: string) => void;
}

export function TagDetailSheet({ name, onClose, onRenamed }: TagDetailSheetProps) {
  const info = useTagInfo(name);
  return (
    <Sheet open={name !== null} onClose={onClose} title={name ? displayTagName(name) : ''}>
      {info.data ? (
        <TagDetail key={info.data.name} info={info.data} onRenamed={onRenamed} />
      ) : (
        <div className={styles.loading}>
          <Spinner />
        </div>
      )}
    </Sheet>
  );
}

function TagDetail({ info, onRenamed }: { info: TagInfo; onRenamed: (name: string) => void }) {
  const api = useApi();
  const edit = useTagEdit();
  const [newName, setNewName] = useState(displayTagName(info.name));
  const error =
    edit.error instanceof ApiRequestError
      ? edit.error.message
      : edit.error
        ? 'Couldn’t save that change.'
        : null;

  const run = (work: () => Promise<TagInfo>) => edit.mutate(work);
  const rename = (e: FormEvent) => {
    e.preventDefault();
    const target = normalizeTagName(newName);
    if (!target || target === info.name) return;
    edit.mutate(() => api.updateTag(info.name, { name: target }), {
      onSuccess: (renamed) => onRenamed(renamed.name),
    });
  };

  return (
    <div className={styles.detail}>
      <p className={styles.usage}>
        On {info.count} {info.count === 1 ? 'image' : 'images'} ·{' '}
        <Link to={`/search?${searchToParams({ ...EMPTY_SEARCH, include: [info.name] })}`}>Show them</Link>
      </p>

      <form className={styles.field} onSubmit={rename}>
        <span className={styles.label}>Name</span>
        <input value={newName} onChange={(e) => setNewName(e.target.value)} aria-label="Tag name" />
        <Button type="submit" disabled={edit.isPending}>
          Rename
        </Button>
      </form>
      <p className={styles.hint}>
        Renaming to an existing tag merges the two; the old name keeps working as an alias.
      </p>

      <label className={styles.field}>
        <span className={styles.label}>Category</span>
        <select
          value={info.category}
          onChange={(e) => run(() => api.updateTag(info.name, { category: e.target.value as TagCategory }))}
          aria-label="Category"
        >
          {TAG_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </label>

      <TagList
        title="Aliases"
        hint="Other names (e.g. from the tagger) that mean this tag."
        names={info.aliases}
        placeholder="Add an alias"
        onAdd={(alias) => run(() => api.addAlias(info.name, alias))}
        onRemove={(alias) => run(() => api.removeAlias(info.name, alias))}
        suggest={false}
      />
      <TagList
        title="Implies"
        hint="Images with this tag also count as having these."
        names={info.implies}
        placeholder="Add an implied tag"
        onAdd={(implies) => run(() => api.addImplication(info.name, implies))}
        onRemove={(implied) => run(() => api.removeImplication(info.name, implied))}
        suggest
      />
      {info.impliedBy.length > 0 && (
        <section>
          <h3 className={styles.sectionTitle}>Implied by</h3>
          <div className={styles.pills}>
            {info.impliedBy.map((n) => (
              <TagPill key={n} name={n} size="sm" />
            ))}
          </div>
        </section>
      )}
      {error && <p className={styles.error}>{error}</p>}
    </div>
  );
}

function TagList({
  title,
  hint,
  names,
  placeholder,
  onAdd,
  onRemove,
  suggest,
}: {
  title: string;
  hint: string;
  names: string[];
  placeholder: string;
  onAdd: (name: string) => void;
  onRemove: (name: string) => void;
  /** Autocomplete from existing tags (implications) or free text (aliases). */
  suggest: boolean;
}) {
  const [draft, setDraft] = useState('');
  const submitDraft = (e: FormEvent) => {
    e.preventDefault();
    const value = normalizeTagName(draft);
    if (value) onAdd(value);
    setDraft('');
  };
  return (
    <section>
      <h3 className={styles.sectionTitle}>{title}</h3>
      <p className={styles.hint}>{hint}</p>
      <div className={styles.pills}>
        {names.map((n) => (
          <button
            key={n}
            type="button"
            className={styles.pillButton}
            onClick={() => onRemove(n)}
            aria-label={`Remove ${n}`}
          >
            <TagPill name={n} size="sm" trailing={<Icon name="close" size={11} strokeWidth={2.6} />} />
          </button>
        ))}
      </div>
      {suggest ? (
        <TagInput
          aria-label={placeholder}
          placeholder={placeholder}
          hide={names}
          onSubmit={(text) => onAdd(normalizeTagName(text))}
        />
      ) : (
        <form onSubmit={submitDraft} className={styles.aliasForm}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </form>
      )}
    </section>
  );
}
