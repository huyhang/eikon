import type { GroupKind, GroupSort, ImageQuery, Rating } from '@eikon/shared';

export const queryKeys = {
  authStatus: ['auth', 'status'] as const,
  mosaic: ['auth', 'mosaic'] as const,
  home: (maxRating?: Rating) => ['home', maxRating ?? 'all'] as const,
  groups: (kind: GroupKind, sort: GroupSort, maxRating?: Rating) =>
    ['groups', kind, sort, maxRating ?? 'all'] as const,
  group: (id: number, maxRating?: Rating) => ['group', id, maxRating ?? 'all'] as const,
  images: (query: ImageQuery) => ['images', query] as const,
  image: (id: number) => ['image', id] as const,
  suggest: (q: string, maxRating?: Rating) => ['tags', 'suggest', q, maxRating ?? 'all'] as const,
  related: (query: ImageQuery) => ['tags', 'related', query] as const,
  topTags: (maxRating?: Rating) => ['tags', 'top', maxRating ?? 'all'] as const,
  savedSearches: ['savedSearches'] as const,
  status: ['status'] as const,
  failed: ['tagging', 'failed'] as const,
  settings: ['settings'] as const,
};
