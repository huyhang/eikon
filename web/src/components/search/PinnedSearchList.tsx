import { Link } from 'react-router';
import clsx from 'clsx';
import { useDeleteSavedSearch, useSavedSearches } from '../../api/hooks';
import { savedQueryToSearch, searchToParams } from '../../core/searchState';
import { Icon } from '../common/Icon';
import styles from './PinnedSearchList.module.css';

/** Pinned searches as sidebar rows ("compact") or tappable cards ("cards", the phone Saved tab). */
export function PinnedSearchList({ variant }: { variant: 'compact' | 'cards' }) {
  const { data } = useSavedSearches();
  const remove = useDeleteSavedSearch();
  if (!data?.length) return null;
  return (
    <ul className={clsx(styles.list, styles[variant])}>
      {data.map((saved) => (
        <li key={saved.id} className={styles.item}>
          <Link to={`/search?${searchToParams(savedQueryToSearch(saved.query))}`} className={styles.link}>
            <Icon name="search" size={variant === 'cards' ? 17 : 14} />
            <span className={styles.name}>{saved.name}</span>
          </Link>
          <button
            type="button"
            className={styles.unpin}
            aria-label={`Unpin ${saved.name}`}
            onClick={() => remove.mutate(saved.id)}
          >
            <Icon name="close" size={12} strokeWidth={2.4} />
          </button>
        </li>
      ))}
    </ul>
  );
}
