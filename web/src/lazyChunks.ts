import { lazy, type ComponentType } from 'react';

type Loader = () => Promise<unknown>;
const loaders: Loader[] = [];

/** A component loaded on first use; its chunk is also fetched early by preloadChunks(). */
function chunk<P>(load: () => Promise<ComponentType<P>>) {
  loaders.push(load);
  return lazy(async () => ({ default: await load() }));
}

// The library page and the grid ship in the main bundle; everything else loads when needed.
export const Viewer = chunk(() => import('./components/viewer/Viewer').then((m) => m.Viewer));
export const Slideshow = chunk(() => import('./components/viewer/Slideshow').then((m) => m.Slideshow));
export const AllImagesPage = chunk(() => import('./pages/AllImagesPage').then((m) => m.AllImagesPage));
export const DuplicatesPage = chunk(() => import('./pages/DuplicatesPage').then((m) => m.DuplicatesPage));
export const FavoritesPage = chunk(() => import('./pages/FavoritesPage').then((m) => m.FavoritesPage));
export const GroupPage = chunk(() => import('./pages/GroupPage').then((m) => m.GroupPage));
export const GroupsIndexPage = chunk(() => import('./pages/GroupsIndexPage').then((m) => m.GroupsIndexPage));
export const ReviewPage = chunk(() => import('./pages/ReviewPage').then((m) => m.ReviewPage));
export const SavedPage = chunk(() => import('./pages/SavedPage').then((m) => m.SavedPage));
export const SearchPage = chunk(() => import('./pages/SearchPage').then((m) => m.SearchPage));
export const SettingsPage = chunk(() => import('./pages/SettingsPage').then((m) => m.SettingsPage));
export const TagsPage = chunk(() => import('./pages/TagsPage').then((m) => m.TagsPage));

const loadAll = () => loaders.forEach((load) => void load().catch(() => {}));

/** Fetches every chunk once the browser is idle, so later taps don't wait on the network. */
export function preloadChunks(): void {
  if ('requestIdleCallback' in window) window.requestIdleCallback(loadAll, { timeout: 4000 });
  else setTimeout(loadAll, 2000);
}
