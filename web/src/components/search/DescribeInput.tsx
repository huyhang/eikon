import { useState, type FormEvent } from 'react';
import { MAX_EMBED_TEXT_LENGTH } from '@eikon/shared';
import { Icon } from '../common/Icon';
import styles from './DescribeInput.module.css';

interface DescribeInputProps {
  value: string;
  onSubmit: (text: string) => void;
  autoFocus?: boolean;
}

/** Free-text description for "describe" search; submits on Enter (an empty submit clears it). */
export function DescribeInput({ value, onSubmit, autoFocus }: DescribeInputProps) {
  const [draft, setDraft] = useState(value);
  // Follow the URL when Back/Forward changes the description (adjust state on prop change).
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit(draft);
  };
  return (
    <form className={styles.form} onSubmit={submit} role="search">
      <Icon name="sparkles" size={18} className={styles.icon} />
      <input
        className={styles.input}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        maxLength={MAX_EMBED_TEXT_LENGTH}
        placeholder="Describe it: “girl reading under cherry blossoms”"
        aria-label="Describe what you are looking for"
        enterKeyHint="search"
        autoFocus={autoFocus}
      />
      {draft && (
        <button
          type="button"
          className={styles.clear}
          aria-label="Clear description"
          onClick={() => {
            setDraft('');
            onSubmit('');
          }}
        >
          <Icon name="close" size={12} strokeWidth={2.8} />
        </button>
      )}
    </form>
  );
}
