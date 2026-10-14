import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import { displayTagName } from '@eikon/shared';
import { useGroups, useSavedSearches, useTagSuggestions } from '../../api/hooks';
import { formatCount } from '../../core/format';
import { moveHighlight, rankPalette, type PaletteItem } from '../../core/palette';
import { EMPTY_SEARCH, savedQueryToSearch, searchToParams } from '../../core/searchState';
import { useCapabilities } from '../../hooks/useCapabilities';
import { Icon } from '../common/Icon';
import { groupPath } from '../layout/navigation';
import styles from './CommandPalette.module.css';

const PAGES: PaletteItem[] = [
  { id: 'p:library', label: 'Library', hint: 'Page', to: '/' },
  { id: 'p:illustrators', label: 'Illustrators', hint: 'Page', to: '/illustrators' },
  { id: 'p:collections', label: 'Collections', hint: 'Page', to: '/collections' },
  { id: 'p:favorites', label: 'Favorites', hint: 'Page', to: '/favorites' },
  { id: 'p:saved', label: 'Saved', hint: 'Page', to: '/saved', keywords: ['pinned searches'] },
  { id: 'p:search', label: 'Search', hint: 'Page', to: '/search' },
  { id: 'p:all', label: 'All Images', hint: 'Page', to: '/all' },
  { id: 'p:review', label: 'Review Tags', hint: 'Page', to: '/review' },
  {
    id: 'p:tags',
    label: 'Manage Tags',
    hint: 'Page',
    to: '/tags',
    keywords: ['aliases', 'implications', 'rename'],
  },
  { id: 'p:duplicates', label: 'Duplicates', hint: 'Page', to: '/duplicates' },
  { id: 'p:settings', label: 'Settings', hint: 'Page', to: '/settings', keywords: ['backup', 'export'] },
];

const RESULT_LIMIT = 12;

/** Builds the palette's candidates from what is already cached plus tag suggestions for the query. */
function usePaletteItems(query: string, open: boolean): PaletteItem[] {
  const illustrators = useGroups('illustrator', 'name');
  const collections = useGroups('collection', 'name');
  const saved = useSavedSearches();
  const tags = useTagSuggestions(open ? query : '');
  const { describe } = useCapabilities();
  return useMemo(() => {
    const groups = [...(illustrators.data ?? []), ...(collections.data ?? [])].map((g) => ({
      id: `g:${g.id}`,
      label: g.name,
      hint: `${g.kind === 'illustrator' ? 'Illustrator' : 'Collection'} · ${formatCount(g.imageCount)}`,
      to: groupPath(g.kind, g.id),
    }));
    const pinned = (saved.data ?? []).map((s) => ({
      id: `s:${s.id}`,
      label: s.name,
      hint: 'Pinned search',
      to: `/search?${searchToParams(savedQueryToSearch(s.query))}`,
    }));
    const tagItems = (tags.data ?? []).map((t) => ({
      id: `t:${t.name}`,
      label: displayTagName(t.name),
      hint: `Tag · ${formatCount(t.count)}`,
      to: `/search?${searchToParams({ ...EMPTY_SEARCH, include: [t.name] })}`,
    }));
    const describeItem: PaletteItem[] =
      describe && query.trim()
        ? [
            {
              id: 'd',
              label: `Describe: “${query.trim()}”`,
              hint: 'Search by description',
              to: `/search?${searchToParams({ ...EMPTY_SEARCH, text: query.trim() })}`,
              keywords: [query],
            },
          ]
        : [];
    return [...PAGES, ...groups, ...pinned, ...tagItems, ...describeItem];
  }, [illustrators.data, collections.data, saved.data, tags.data, describe, query]);
}

/** ⌘K / Ctrl+K: jump anywhere — pages, illustrators, collections, pinned searches, tags. */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);
  if (!open) return null;
  return createPortal(<Palette onClose={() => setOpen(false)} />, document.body);
}

/** Lets a button anywhere open the palette without sharing state. */
export const OPEN_PALETTE_EVENT = 'eikon:open-palette';

function Palette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const navigate = useNavigate();
  const results = rankPalette(usePaletteItems(query, true), query, RESULT_LIMIT);

  const choose = (item: PaletteItem | undefined) => {
    if (!item) return;
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => moveHighlight(h, e.key as 'ArrowDown' | 'ArrowUp', results.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Jump to">
      <div className={styles.backdrop} onClick={onClose} />
      <div className={styles.panel}>
        <div className={styles.inputRow}>
          <Icon name="search" size={18} />
          <input
            className={styles.input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlight(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Jump to a page, illustrator, collection or tag…"
            aria-label="Jump to"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <kbd className={styles.kbd}>esc</kbd>
        </div>
        <ul className={styles.results} role="listbox" aria-label="Results">
          {results.map((item, i) => (
            <li key={item.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={i === highlight ? `${styles.result} ${styles.active}` : styles.result}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => choose(item)}
              >
                <span className={styles.label}>{item.label}</span>
                <span className={styles.hint}>{item.hint}</span>
              </button>
            </li>
          ))}
          {results.length === 0 && <li className={styles.empty}>Nothing matches “{query}”.</li>}
        </ul>
      </div>
    </div>
  );
}
