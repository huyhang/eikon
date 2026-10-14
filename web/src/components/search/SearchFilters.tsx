import { useState } from 'react';
import type { GroupSummary, ImageSort } from '@eikon/shared';
import { SIDEBAR_QUERY, useMediaQuery } from '../../hooks/useMediaQuery';
import { Segmented } from '../common/Controls';
import { Icon } from '../common/Icon';
import { Sheet } from '../common/Sheet';
import styles from './SearchFilters.module.css';

export const SORTS: { value: ImageSort; label: string }[] = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'random', label: 'Shuffle' },
];

interface SearchFiltersProps {
  groups: GroupSummary[];
  group: number | undefined;
  onGroupChange: (group: number | undefined) => void;
  sort: ImageSort;
  onSortChange: (sort: ImageSort) => void;
  /** Ranked results (describe / similar) have their own order, so sorting is hidden. */
  ranked: boolean;
}

/** Where to look and how to order: inline on wide screens, behind one "Filters" button on phones. */
export function SearchFilters(props: SearchFiltersProps) {
  const wide = useMediaQuery(SIDEBAR_QUERY);
  const [open, setOpen] = useState(false);
  if (wide) return <FilterControls {...props} />;
  const active = (props.group !== undefined ? 1 : 0) + (!props.ranked && props.sort !== 'newest' ? 1 : 0);
  return (
    <>
      <button
        type="button"
        className={styles.filtersButton}
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
      >
        <Icon name="chevronDown" size={13} strokeWidth={2.4} />
        Filters{active > 0 && <span className={styles.badge}>{active}</span>}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filters">
        <div className={styles.sheetBody}>
          <FilterControls {...props} />
        </div>
      </Sheet>
    </>
  );
}

function FilterControls({ groups, group, onGroupChange, sort, onSortChange, ranked }: SearchFiltersProps) {
  return (
    <div className={styles.controls}>
      <GroupFilter groups={groups} value={group} onChange={onGroupChange} />
      {!ranked && <Segmented label="Sort" value={sort} options={SORTS} onChange={onSortChange} />}
    </div>
  );
}

function GroupFilter({
  groups,
  value,
  onChange,
}: {
  groups: GroupSummary[];
  value?: number;
  onChange: (id?: number) => void;
}) {
  const illustrators = groups.filter((g) => g.kind === 'illustrator');
  const collections = groups.filter((g) => g.kind === 'collection');
  return (
    <label className={styles.groupFilter}>
      <span>In:</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : undefined)}
        aria-label="Limit search to an illustrator or collection"
      >
        <option value="">All images</option>
        {illustrators.length > 0 && (
          <optgroup label="Illustrators">
            {illustrators.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </optgroup>
        )}
        {collections.length > 0 && (
          <optgroup label="Collections">
            {collections.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      <Icon name="chevronDown" size={13} strokeWidth={2.4} />
    </label>
  );
}
