import type { IconName } from '../common/Icon';

export interface NavItem {
  to: string;
  label: string;
  icon: IconName;
}

export const PRIMARY_NAV: NavItem[] = [
  { to: '/', label: 'Library', icon: 'library' },
  { to: '/illustrators', label: 'Illustrators', icon: 'illustrators' },
  { to: '/collections', label: 'Collections', icon: 'collections' },
  { to: '/search', label: 'Search', icon: 'search' },
];

export const SIDEBAR_NAV: NavItem[] = [
  { to: '/', label: 'Library', icon: 'library' },
  { to: '/illustrators', label: 'Illustrators', icon: 'illustrators' },
  { to: '/collections', label: 'Collections', icon: 'collections' },
  { to: '/favorites', label: 'Favorites', icon: 'heart' },
  { to: '/search', label: 'Search', icon: 'search' },
];

export function groupPath(kind: 'illustrator' | 'collection', id: number): string {
  return `/${kind === 'illustrator' ? 'illustrators' : 'collections'}/${id}`;
}
