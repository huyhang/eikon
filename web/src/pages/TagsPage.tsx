import { useState } from 'react';
import { displayTagName } from '@eikon/shared';
import { TAG_PAGE_SIZE, useManagedTags } from '../api/hooks';
import { formatCount, pluralize } from '../core/format';
import { Button, Spinner } from '../components/common/Controls';
import { EmptyState } from '../components/common/EmptyState';
import { Icon } from '../components/common/Icon';
import { PageHeader } from '../components/layout/PageHeader';
import { TagPill } from '../components/search/TagPill';
import { TagDetailSheet } from '../components/tags/TagDetailSheet';
import styles from './TagsPage.module.css';

/** Every tag with its usage; open one to rename, merge, recategorise, alias or set implications. */
export function TagsPage() {
  const [query, setQuery] = useState('');
  const [pages, setPages] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const tags = useManagedTags(query.trim(), pages - 1);
  const [loaded, setLoaded] = useState<{ query: string; items: NonNullable<typeof tags.data>['tags'] }>({
    query: '',
    items: [],
  });
  // Accumulate pages for "Show more"; a new filter starts over (adjust state on prop change).
  const pageKey = `${query.trim()}:${pages}`;
  const [seenKey, setSeenKey] = useState('');
  if (tags.data && !tags.isPlaceholderData && pageKey !== seenKey) {
    setSeenKey(pageKey);
    setLoaded({
      query: query.trim(),
      items:
        pages === 1 || loaded.query !== query.trim() ? tags.data.tags : [...loaded.items, ...tags.data.tags],
    });
  }
  const total = tags.data?.total ?? 0;

  return (
    <div className={styles.page}>
      <PageHeader
        title="Tags"
        back={{ to: '/settings', label: 'Settings' }}
        subtitle={tags.data ? pluralize(total, 'tag') : undefined}
      >
        <label className={styles.filter}>
          <Icon name="search" size={17} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPages(1);
            }}
            placeholder="Filter tags or aliases"
            aria-label="Filter tags"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
        </label>
      </PageHeader>

      {!tags.data ? (
        <div className={styles.loading}>
          <Spinner />
        </div>
      ) : loaded.items.length === 0 && !tags.isPlaceholderData ? (
        <EmptyState icon="tag" title="No tags">
          <p>
            {query ? 'No tag or alias contains that.' : 'Tags appear once gpubox has analyzed some images.'}
          </p>
        </EmptyState>
      ) : (
        <>
          <ul className={styles.list}>
            {loaded.items.map((tag) => (
              <li key={tag.name}>
                <button type="button" className={styles.row} onClick={() => setOpen(tag.name)}>
                  <TagPill name={tag.name} category={tag.category} size="sm" />
                  <span className={styles.meta}>
                    {tag.aliases.length > 0 && <span>aka {tag.aliases.map(displayTagName).join(', ')}</span>}
                    {tag.implies.length > 0 && <span>→ {tag.implies.map(displayTagName).join(', ')}</span>}
                  </span>
                  <span className={styles.count}>{formatCount(tag.count)}</span>
                </button>
              </li>
            ))}
          </ul>
          {loaded.items.length < total && (
            <div className={styles.more}>
              <Button onClick={() => setPages(pages + 1)} disabled={tags.isFetching}>
                Show {Math.min(TAG_PAGE_SIZE, total - loaded.items.length)} more
              </Button>
            </div>
          )}
        </>
      )}

      <TagDetailSheet name={open} onClose={() => setOpen(null)} onRenamed={setOpen} />
    </div>
  );
}
