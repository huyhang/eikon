import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  BulkEditRequest,
  CreateSavedSearchRequest,
  GroupKind,
  GroupSort,
  ImageDetail,
  ImageQuery,
  Rating,
  Settings,
  TagInfo,
} from '@eikon/shared';
import { useApi } from '../context/Dependencies';
import { useMaxRating } from '../context/Prefs';
import { queryKeys } from './queryKeys';

export function useHome() {
  const api = useApi();
  const maxRating = useMaxRating();
  return useQuery({ queryKey: queryKeys.home(maxRating), queryFn: () => api.home(maxRating) });
}

export function useGroups(kind: GroupKind, sort: GroupSort) {
  const api = useApi();
  const maxRating = useMaxRating();
  return useQuery({
    queryKey: queryKeys.groups(kind, sort, maxRating),
    queryFn: () => api.groups(kind, sort, maxRating),
    placeholderData: keepPreviousData,
  });
}

export function useGroup(id: number) {
  const api = useApi();
  const maxRating = useMaxRating();
  return useQuery({ queryKey: queryKeys.group(id, maxRating), queryFn: () => api.group(id, maxRating) });
}

/** A query with the safe-mode rating cap applied. */
export function withSafeMode(query: ImageQuery, maxRating: Rating | undefined): ImageQuery {
  return maxRating ? { ...query, maxRating } : query;
}

/** Image list for a grid; safe mode is applied automatically. */
export function useImages(query: ImageQuery, enabled = true) {
  const api = useApi();
  const full = withSafeMode(query, useMaxRating());
  return useQuery({
    queryKey: queryKeys.images(full),
    queryFn: () => api.images(full),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useImageDetail(id: number | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.image(id ?? -1),
    queryFn: () => api.image(id!),
    enabled: id !== null,
  });
}

export function useTagSuggestions(q: string) {
  const api = useApi();
  const maxRating = useMaxRating();
  const term = q.trim();
  return useQuery({
    queryKey: queryKeys.suggest(term, maxRating),
    queryFn: () => api.suggestTags(term, 8, maxRating),
    enabled: term.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export function useRelatedTags(query: ImageQuery, enabled: boolean) {
  const api = useApi();
  const maxRating = useMaxRating();
  const full: ImageQuery = maxRating ? { ...query, maxRating } : query;
  return useQuery({
    queryKey: queryKeys.related(full),
    queryFn: () => api.relatedTags(full, 16),
    enabled,
    placeholderData: keepPreviousData,
  });
}

export function useTopTags(limit = 60) {
  const api = useApi();
  const maxRating = useMaxRating();
  return useQuery({ queryKey: queryKeys.topTags(maxRating), queryFn: () => api.topTags(limit, maxRating) });
}

export function useSavedSearches() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.savedSearches, queryFn: () => api.savedSearches() });
}

export function useCreateSavedSearch() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: CreateSavedSearchRequest) => api.createSavedSearch(request),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.savedSearches }),
  });
}

export function useDeleteSavedSearch() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.deleteSavedSearch(id),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.savedSearches }),
  });
}

/** True while there is visible background work worth polling fast for. */
export function isBusy(status: {
  scan: { phase: string };
  tagging: { pending: number; taggerOnline: boolean };
}) {
  return status.scan.phase !== 'idle' || (status.tagging.pending > 0 && status.tagging.taggerOnline);
}

export function useStatus() {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.status,
    queryFn: () => api.status(),
    refetchInterval: (query) => (query.state.data && isBusy(query.state.data) ? 3_000 : 15_000),
  });
}

export function useFailedImages(enabled: boolean) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.failed, queryFn: () => api.failedImages(), enabled });
}

function useSystemAction(action: () => Promise<void>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: queryKeys.status });
      void client.invalidateQueries({ queryKey: queryKeys.failed });
    },
  });
}

export function useScan() {
  const api = useApi();
  return useSystemAction(() => api.scan());
}

export function useRetryFailed() {
  const api = useApi();
  return useSystemAction(() => api.retryFailed());
}

export function useRetagAll() {
  const api = useApi();
  return useSystemAction(() => api.retagAll());
}

export function useSettings() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => api.settings() });
}

export function useUpdateSettings() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.updateSettings(patch),
    onSuccess: (settings) => {
      client.setQueryData(queryKeys.settings, settings);
      // Thresholds change which tags are visible everywhere.
      void client.invalidateQueries({
        predicate: (q) => q.queryKey[0] !== 'settings' && q.queryKey[0] !== 'auth',
      });
    },
  });
}

export function useToggleFavorite(id: number) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (favorite: boolean) => api.setFavorite(id, favorite),
    onMutate: async (favorite) => {
      const key = queryKeys.image(id);
      await client.cancelQueries({ queryKey: key });
      const previous = client.getQueryData<ImageDetail>(key);
      if (previous) client.setQueryData<ImageDetail>(key, { ...previous, favorite });
      return { previous };
    },
    onError: (_error, _favorite, context) => {
      if (context?.previous) client.setQueryData(queryKeys.image(id), context.previous);
    },
    onSettled: () => client.invalidateQueries({ queryKey: ['images'] }),
  });
}

function useTagMutation(id: number, run: (tag: string) => Promise<ImageDetail>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.image(id), detail);
      void client.invalidateQueries({ queryKey: ['tags'] });
      void client.invalidateQueries({ queryKey: ['images'] });
    },
  });
}

export function useAddTag(id: number) {
  const api = useApi();
  return useTagMutation(id, (tag) => api.addTag(id, tag));
}

export function useRemoveTag(id: number) {
  const api = useApi();
  return useTagMutation(id, (name) => api.removeTag(id, name));
}

/** Images most like `id` (needs embeddings; disabled when there is no embedding model). */
export function useSimilarImages(id: number | null, limit: number, enabled: boolean) {
  return useImages({ like: id ?? 0, limit }, enabled && id !== null);
}

export function useSetRating(id: number) {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (rating: Rating | null) => api.setRating(id, rating),
    onSuccess: (detail) => {
      client.setQueryData(queryKeys.image(id), detail);
      void client.invalidateQueries({ queryKey: ['images'] });
      void client.invalidateQueries({ queryKey: ['home'] });
      void client.invalidateQueries({ queryKey: ['groups'] });
    },
  });
}

export function useDuplicates() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.duplicates, queryFn: () => api.duplicates() });
}

export function useReviewQueue(limit = 20) {
  const api = useApi();
  const maxRating = useMaxRating();
  return useQuery({
    queryKey: queryKeys.review(maxRating),
    queryFn: () => api.reviewQueue(limit, maxRating),
    placeholderData: keepPreviousData,
  });
}

export function useMarkReviewed() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.markReviewed(id),
    onSuccess: () => client.invalidateQueries({ queryKey: ['images', 'review'] }),
  });
}

export function useMarkAllReviewed() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.markAllReviewed(),
    onSuccess: () => client.invalidateQueries({ queryKey: ['images', 'review'] }),
  });
}

export function useBulkEdit() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: BulkEditRequest) => api.bulkEdit(request),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['images'] });
      void client.invalidateQueries({ queryKey: ['image'] });
      void client.invalidateQueries({ queryKey: ['tags'] });
    },
  });
}

export const TAG_PAGE_SIZE = 60;

export function useManagedTags(query: string, page: number) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.manageTags(query, page),
    queryFn: () => api.manageTags(query, TAG_PAGE_SIZE, page * TAG_PAGE_SIZE),
    placeholderData: keepPreviousData,
  });
}

export function useTagInfo(name: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.tagInfo(name ?? ''),
    queryFn: () => api.tagInfo(name!),
    enabled: name !== null,
  });
}

/** Any tag-manager edit: refreshes everything tags appear in. */
export function useTagEdit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (edit: () => Promise<TagInfo>) => edit(),
    onSuccess: (info) => {
      client.setQueryData(queryKeys.tagInfo(info.name), info);
      void client.invalidateQueries({ queryKey: ['tags'] });
      void client.invalidateQueries({ queryKey: ['images'] });
      void client.invalidateQueries({ queryKey: ['image'] });
    },
  });
}

export function useBackups() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.backups, queryFn: () => api.backups() });
}

export function useCreateBackup() {
  const api = useApi();
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.createBackup(),
    onSuccess: () => client.invalidateQueries({ queryKey: queryKeys.backups }),
  });
}
