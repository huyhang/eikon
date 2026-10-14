import type { IconName } from '../common/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

const NAV = {
  library: { to: '/', label: 'Library', icon: 'library' },
  illustrators: { to: '/illustrators', label: 'Illustrators', icon: 'illustrators' },
  collections: { to: '/collections', label: 'Collections', icon: 'collections' },
  search: { to: '/search', label: 'Search', icon: 'search' },
  saved: { to: '/saved', label: 'Saved', icon: 'bookmark' },
  favorites: { to: '/favorites', label: 'Favorites', icon: 'heart' },
  review: { to: '/review', label: 'Review Tags', icon: 'checkCircle' },
} satisfies Record<string, NavItem>;

/** Phone tab bar: favourites and pinned searches live together under Saved. */
export const PRIMARY_NAV: NavItem[] = [NAV.library, NAV.illustrators, NAV.collections, NAV.search, NAV.saved];

/** Wide-screen sidebar: pinned searches have their own section, so Favorites stands alone. */
export const SIDEBAR_NAV: NavItem[] = [
  NAV.library,
  NAV.illustrators,
  NAV.collections,
  NAV.favorites,
  NAV.search,
  NAV.review,
];

export function groupPath(kind: 'illustrator' | 'collection', id: number): string {
  return `/${kind === 'illustrator' ? 'illustrators' : 'collections'}/${id}`;
}
