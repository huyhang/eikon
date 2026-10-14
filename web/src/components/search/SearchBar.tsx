import { AnimatePresence, motion } from 'motion/react';
import { displayTagName } from '@eikon/shared';
import { chipsOf, type SearchAction, type SearchState } from '../../core/searchState';
import { Icon } from '../common/Icon';
import { TagInput } from './TagInput';
import styles from './SearchBar.module.css';

interface SearchBarProps {
  state: SearchState;
  dispatch: (action: SearchAction) => void;
  placeholder?: string;
  autoFocus?: boolean;
}

/** Chips (tap to include/exclude, ✕ to remove) followed by an autocompleting tag input. */
export function SearchBar({ state, dispatch, placeholder = 'Search tags', autoFocus }: SearchBarProps) {
  const chips = chipsOf(state);
  return (
    <div className={styles.bar}>
      <Icon name="search" size={18} className={styles.icon} />
      <AnimatePresence initial={false}>
        {chips.map((chip) => (
          <motion.span
            key={chip.tag}
            layout
            className={styles.chip}
            initial={{ opacity: 0, scale: 0.7 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.7 }}
            transition={{ type: 'spring', stiffness: 500, damping: 32 }}
          >
            <span className={styles.chipInner} data-mode={chip.mode}>
              <button
                type="button"
                className={styles.chipLabel}
                onClick={() => dispatch({ type: 'toggle', tag: chip.tag })}
                title={chip.mode === 'include' ? 'Tap to exclude' : 'Tap to include'}
                aria-label={`${displayTagName(chip.tag)}: ${chip.mode === 'include' ? 'included, tap to exclude' : 'excluded, tap to include'}`}
              >
                {chip.mode === 'exclude' && <span className={styles.minus}>−</span>}
                <span className={styles.chipName}>{displayTagName(chip.tag)}</span>
              </button>
              <button
                type="button"
                className={styles.remove}
                aria-label={`Remove ${displayTagName(chip.tag)}`}
                onClick={() => dispatch({ type: 'remove', tag: chip.tag })}
              >
                <Icon name="close" size={10} strokeWidth={2.8} />
              </button>
            </span>
          </motion.span>
        ))}
      </AnimatePresence>
      <TagInput
        aria-label="Add a tag to the search"
        placeholder={chips.length ? 'Add tag or −tag' : placeholder}
        hide={[...state.include, ...state.exclude]}
        autoFocus={autoFocus}
        onSubmit={(text) => dispatch({ type: 'add', tag: text })}
        onBackspaceEmpty={() => dispatch({ type: 'removeLast' })}
      />
      {chips.length > 0 && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => dispatch({ type: 'clear' })}
          aria-label="Clear search"
        >
          <Icon name="close" size={12} strokeWidth={2.8} />
        </button>
      )}
    </div>
  );
}
