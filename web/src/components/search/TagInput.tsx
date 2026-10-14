import { useId, useState, type KeyboardEvent } from 'react';
import clsx from 'clsx';
import type { TagCount } from '@eikon/shared';
import { useTagSuggestions } from '../../api/hooks';
import { enterChoice } from './enterChoice';
import { TagPill } from './TagPill';
import styles from './TagInput.module.css';

interface TagInputProps {
  onSubmit: (text: string) => void;
  /** Called on Backspace in an empty input (removes the last chip in the search bar). */
  onBackspaceEmpty?: () => void;
  /** Tags already chosen; hidden from suggestions. */
  hide?: string[];
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** Text input with category-coloured autocomplete. Enter picks the highlighted suggestion or the typed text. */
export function TagInput({
  onSubmit,
  onBackspaceEmpty,
  hide = [],
  placeholder,
  autoFocus,
  className,
  ...rest
}: TagInputProps) {
  const [text, setText] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [focused, setFocused] = useState(false);
  const listId = useId();
  const term = text.replace(/^-/, '').replace(/^[a-z]+:/i, '');
  const { data, isPlaceholderData, isFetching } = useTagSuggestions(term);
  const suggestions = (data ?? []).filter((s) => !hide.includes(s.name));
  const open = focused && text.trim().length > 0 && suggestions.length > 0;

  const submit = (value: string) => {
    if (!value.trim()) return;
    onSubmit(value);
    setText('');
    setHighlight(0);
  };

  const pick = (suggestion: TagCount) => {
    const prefix = text.startsWith('-') ? '-' : (/^([a-z]+:)/i.exec(text)?.[1] ?? '');
    submit(prefix + suggestion.name);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' && open) {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp' && open) {
      e.preventDefault();
      setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (!text.trim()) return;
      e.preventDefault();
      const fresh = open && !isPlaceholderData && !isFetching;
      const chosen = enterChoice({ text, suggestions, highlight, fresh });
      if (typeof chosen === 'string') submit(chosen);
      else if (chosen) pick(chosen);
    } else if (e.key === 'Backspace' && text === '') {
      onBackspaceEmpty?.();
    } else if (e.key === 'Escape') {
      if (text) {
        e.stopPropagation();
        setText('');
      } else {
        (e.target as HTMLInputElement).blur();
      }
    }
  };

  return (
    <div className={clsx(styles.wrap, className)}>
      <input
        className={styles.input}
        value={text}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(e) => {
          setText(e.target.value);
          setHighlight(0);
        }}
        onKeyDown={onKeyDown}
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 120)}
        {...rest}
      />
      {open && (
        <ul className={styles.list} id={listId} role="listbox">
          {suggestions.map((s, i) => (
            <li key={s.name} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={clsx(styles.option, i === highlight && styles.highlighted)}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(s)}
              >
                <span className={styles.dot} data-category={s.category} />
                <TagPill name={s.name} category={s.category} size="sm" className={styles.optionPill} />
                <span className={styles.optionCount}>{s.count.toLocaleString('en-US')}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
