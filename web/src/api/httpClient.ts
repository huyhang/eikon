import {
  decodeTile,
  imageQueryToSearchParams,
  type AuthStatus,
  type CreateSavedSearchRequest,
  type FailedImage,
  type FailedImagesResponse,
  type GroupDetailResponse,
  type GroupKind,
  type GroupListResponse,
  type GroupSort,
  type GroupSummary,
  type HomeResponse,
  type ImageDetail,
  type ImageListResponse,
  type ImageQuery,
  type LoginErrorResponse,
  type LoginRequest,
  type MosaicResponse,
  type Rating,
  type SavedSearch,
  type SavedSearchListResponse,
  type Settings,
  type StatusResponse,
  type TagCount,
  type TagListResponse,
} from '@eikon/shared';
import { ApiRequestError, type ApiClient, type ImageList, type LoginResult } from './client';

export interface HttpApiClientOptions {
  fetch?: typeof fetch;
  baseUrl?: string;
  /** Called whenever a protected endpoint answers 401, so the UI can show the lock screen. */
  onUnauthorized?: () => void;
}

type Params = Record<string, string | number | undefined>;

export function withParams(path: string, params: Params | URLSearchParams = {}): string {
  const search =
    params instanceof URLSearchParams
      ? params
      : new URLSearchParams(
          Object.entries(params)
            .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
            .map(([k, v]) => [k, String(v)]),
        );
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

export class HttpApiClient implements ApiClient {
  private readonly fetchImpl: typeof fetch;
  private readonly baseUrl: string;
  private readonly onUnauthorized: () => void;

  constructor(options: HttpApiClientOptions = {}) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.baseUrl = options.baseUrl ?? '';
    this.onUnauthorized = options.onUnauthorized ?? (() => {});
  }

  private async send(path: string, init: RequestInit = {}): Promise<Response> {
    const headers = new Headers(init.headers);
    if (init.body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await this.fetchImpl(this.baseUrl + path, {
      credentials: 'same-origin',
      ...init,
      headers,
    });
    if (response.status === 401 && !path.startsWith('/api/auth/')) this.onUnauthorized();
    return response;
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await this.send(path, init);
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new ApiRequestError(response.status, body?.error ?? response.statusText);
    }
    if (response.status === 204 || response.status === 202) return undefined as T;
    return (await response.json()) as T;
  }

  private json(method: string, body: unknown): RequestInit {
    return { method, body: JSON.stringify(body) };
  }

  authStatus(): Promise<AuthStatus> {
    return this.request('/api/auth/status');
  }

  async login(request: LoginRequest): Promise<LoginResult> {
    const response = await this.send('/api/auth/login', this.json('POST', request));
    if (response.ok) return { ok: true };
    const body = (await response
      .json()
      .catch(() => ({ error: 'Something went wrong' }))) as LoginErrorResponse;
    const result: LoginResult = { ok: false, error: body.error };
    if (body.retryAfterSeconds !== undefined) result.retryAfterSeconds = body.retryAfterSeconds;
    return result;
  }

  async logout(): Promise<void> {
    await this.request('/api/auth/logout', { method: 'POST' });
  }

  async mosaic(): Promise<string[]> {
    return (await this.request<MosaicResponse>('/api/auth/mosaic')).placeholders;
  }

  home(maxRating?: Rating): Promise<HomeResponse> {
    return this.request(withParams('/api/home', { maxRating }));
  }

  async groups(kind: GroupKind, sort: GroupSort, maxRating?: Rating): Promise<GroupSummary[]> {
    return (await this.request<GroupListResponse>(withParams('/api/groups', { kind, sort, maxRating })))
      .groups;
  }

  group(id: number, maxRating?: Rating): Promise<GroupDetailResponse> {
    return this.request(withParams(`/api/groups/${id}`, { maxRating }));
  }

  async images(query: ImageQuery): Promise<ImageList> {
    const body = await this.request<ImageListResponse>(
      withParams('/api/images', imageQueryToSearchParams(query)),
    );
    return { total: body.total, tiles: body.tiles.map(decodeTile) };
  }

  image(id: number): Promise<ImageDetail> {
    return this.request(`/api/images/${id}`);
  }

  async setFavorite(id: number, favorite: boolean): Promise<void> {
    await this.request(`/api/images/${id}/favorite`, { method: favorite ? 'PUT' : 'DELETE' });
  }

  addTag(id: number, tag: string): Promise<ImageDetail> {
    return this.request(`/api/images/${id}/tags`, this.json('POST', { tag }));
  }

  removeTag(id: number, name: string): Promise<ImageDetail> {
    return this.request(`/api/images/${id}/tags/${encodeURIComponent(name)}`, { method: 'DELETE' });
  }

  async suggestTags(q: string, limit: number, maxRating?: Rating): Promise<TagCount[]> {
    return (await this.request<TagListResponse>(withParams('/api/tags/suggest', { q, limit, maxRating })))
      .tags;
  }

  async relatedTags(query: ImageQuery, limit: number): Promise<TagCount[]> {
    const params = imageQueryToSearchParams(query);
    params.set('limit', String(limit));
    return (await this.request<TagListResponse>(withParams('/api/tags/related', params))).tags;
  }

  async topTags(limit: number, maxRating?: Rating): Promise<TagCount[]> {
    return (await this.request<TagListResponse>(withParams('/api/tags/top', { limit, maxRating }))).tags;
  }

  async savedSearches(): Promise<SavedSearch[]> {
    return (await this.request<SavedSearchListResponse>('/api/saved-searches')).searches;
  }

  createSavedSearch(request: CreateSavedSearchRequest): Promise<SavedSearch> {
    return this.request('/api/saved-searches', this.json('POST', request));
  }

  async deleteSavedSearch(id: number): Promise<void> {
    await this.request(`/api/saved-searches/${id}`, { method: 'DELETE' });
  }

  status(): Promise<StatusResponse> {
    return this.request('/api/status');
  }

  async scan(): Promise<void> {
    await this.request('/api/scan', { method: 'POST' });
  }

  async failedImages(): Promise<FailedImage[]> {
    return (await this.request<FailedImagesResponse>('/api/tagging/failed')).images;
  }

  async retryFailed(): Promise<void> {
    await this.request('/api/tagging/retry-failed', { method: 'POST' });
  }

  async retagAll(): Promise<void> {
    await this.request('/api/tagging/retag-all', { method: 'POST' });
  }

  settings(): Promise<Settings> {
    return this.request('/api/settings');
  }

  updateSettings(patch: Partial<Settings>): Promise<Settings> {
    return this.request('/api/settings', this.json('PUT', patch));
  }
}
