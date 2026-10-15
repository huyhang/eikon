# Eikon HTTP API

All types live in `shared/src` (`@eikon/shared`). JSON everywhere unless noted.
Everything except `/api/auth/*` requires a signed-in request (session cookie, or an allowed Tailscale
identity; see [SETUP.md](SETUP.md#sign-in-with-your-tailnet-identity)) and answers
`401 {"error":"unauthorized"}` otherwise. Errors are `{"error": "<message for people>"}`.

`maxRating` (safe mode) may be added to any listing endpoint: images rated above it, or not yet rated, are excluded.

## Auth
| Method | Path | Body / Query | Response |
|---|---|---|---|
| GET  | `/api/auth/status` | | `AuthStatus` (`method`: `session`, `tailscale` or null; `user` for Tailscale sign-ins) |
| POST | `/api/auth/login`  | `LoginRequest` (`remember` keeps the session for 400 days, otherwise 12 hours) | `204` · `401 LoginErrorResponse` · `429 LoginErrorResponse` |
| POST | `/api/auth/logout` | | `204` |
| POST | `/api/auth/sign-out-everywhere` | | `204`; rotates the session key, so every device needs the passcode again |
| GET  | `/api/auth/mosaic` | | `MosaicResponse` (colour placeholders for the lock screen) |

## Browse
| Method | Path | Query | Response |
|---|---|---|---|
| GET | `/api/home` | `maxRating` | `HomeResponse` |
| GET | `/api/groups` | `kind=illustrator\|collection`, `sort=name\|count\|recent`, `maxRating` | `GroupListResponse` |
| GET | `/api/groups/:id` | `maxRating` | `GroupDetailResponse` · `404` |
| GET | `/api/images` | `ImageQuery` (see `imageQueryToSearchParams`) | `ImageListResponse` (compact `TileTuple`s, decode with `decodeTile`) |
| GET | `/api/images/:id` | | `ImageDetail` · `404` |
| GET | `/api/duplicates` | | `DuplicatesResponse`: clusters of near-identical pictures, best copy first |

### `ImageQuery` parameters

| Param | Meaning |
|---|---|
| `tag` (repeatable) | Images must carry every one of these tags (aliases resolve to their tag) |
| `not` (repeatable) | Images must carry none of these tags |
| `group` | Only this illustrator or collection |
| `favorites=1` | Only favorites |
| `sort` | `newest`, `oldest` or `random` (with `seed` for a stable shuffle) |
| `limit` | At most this many tiles |
| `like` | **Ranked:** most similar to this image first ("more like this"); other criteria only filter. `404` if the image is gone, `409` if it has no embedding yet |
| `q` | **Ranked:** best match for this description first ("a girl with an umbrella in the rain"). `503` when gpubox or its embedding model is unavailable |

With **Hide smaller copies** on (`Settings.hideDuplicates`), a smaller copy is left out when its best copy is
in the same result.

## Curate
| Method | Path | Body | Response |
|---|---|---|---|
| PUT    | `/api/images/:id/favorite` | | `204` |
| DELETE | `/api/images/:id/favorite` | | `204` |
| POST   | `/api/images/:id/tags` | `AddTagRequest` | `ImageDetail` |
| DELETE | `/api/images/:id/tags/:name` | | `ImageDetail` |
| PUT    | `/api/images/:id/rating` | `SetRatingRequest` (`rating`: a rating, or `null` to go back to the tagger's) | `ImageDetail` |
| POST   | `/api/images/:id/reviewed` | | `204`; takes it out of the review queue |
| POST   | `/api/images/bulk` | `BulkEditRequest` (`ids`, `addTags`, `removeTags`, `favorite`) | `BulkEditResponse` |
| GET    | `/api/review` | `limit` (default 20, max 100), `maxRating` | `ReviewResponse`: tagged images not yet reviewed, most recently tagged first |
| POST   | `/api/review/mark-all` | | `{ "marked": number }` |

Manual edits are permanent: a removed tag is never re-added by re-tagging, an added tag is never dropped.
Tags implied by another tag (`source: "implied"`) follow it: they appear and disappear with it.

## Tags & saved searches
| Method | Path | Query / Body | Response |
|---|---|---|---|
| GET    | `/api/tags/suggest` | `q`, `limit`, `maxRating` | `TagListResponse` (prefix matches first, by count; aliases included) |
| GET    | `/api/tags/related` | `ImageQuery`, `limit` | `TagListResponse` (most common tags in the result set, minus the query's own tags) |
| GET    | `/api/tags/top` | `limit`, `maxRating` | `TagListResponse` |
| GET    | `/api/saved-searches` | | `SavedSearchListResponse` |
| POST   | `/api/saved-searches` | `CreateSavedSearchRequest` | `SavedSearch` |
| DELETE | `/api/saved-searches/:id` | | `204` |

### Tag manager
Each answers the tag's `TagInfo` (name, category, count, aliases, implications) unless noted;
`400` for a bad request, `404` for an unknown tag, `409` when the change would clash (e.g. an alias that is
already a tag, or an implication that would go round in a circle).

| Method | Path | Body / Query | Effect |
|---|---|---|---|
| GET    | `/api/tags/manage` | `q`, `limit` (default 50, max 200), `offset` | `TagInfoListResponse` |
| GET    | `/api/tags/manage/:name` | | |
| PATCH  | `/api/tags/manage/:name` | `UpdateTagRequest` (`name`, `category`) | Renaming onto an existing tag merges the two |
| POST   | `/api/tags/manage/:name/aliases` | `{ "alias": string }` | Searching or tagging with the alias means this tag |
| DELETE | `/api/tags/manage/:name/aliases/:alias` | | |
| POST   | `/api/tags/manage/:name/implications` | `{ "implies": string }` | Every image with this tag also gets `implies` |
| DELETE | `/api/tags/manage/:name/implications/:implied` | | |

## System
| Method | Path | Body | Response |
|---|---|---|---|
| GET  | `/api/status` | | `StatusResponse` (library, tagging incl. embeddings, review queue) |
| POST | `/api/scan` | | `202` |
| GET  | `/api/tagging/failed` | | `FailedImagesResponse` |
| POST | `/api/tagging/retry-failed` | | `202` |
| POST | `/api/tagging/retag-all` | | `202` |
| GET  | `/api/settings` | | `Settings` |
| PUT  | `/api/settings` | `Partial<Settings>` | `Settings` |
| GET  | `/api/backups` | | `BackupListResponse`, newest first |
| POST | `/api/backups` | | `201 BackupInfo` |
| GET  | `/api/backups/:name` | | The SQLite file (download) · `404` |
| GET  | `/api/export` | | `CurationExport` (download, streamed): every tag, favorite, rating, alias, implication and saved search, keyed by file SHA-256 |

## Media (cookie-protected, immutable, long-cached)
| Path | Content |
|---|---|
| `/media/thumb/:id/sm` | WebP, fits 1440×480 (grid) |
| `/media/thumb/:id/md` | WebP, fits 2048×720 (grid on high-density screens, large covers); thumbnail version 2 and later |
| `/media/thumb/:id/lg` | WebP, fits 2048×2048 (viewer, tagger input) |
| `/media/original/:id` | The original file |

Thumbnail URLs carry the image's `thumbVersion` as `?v=` from version 2 on (`thumbUrl`), so rebuilt thumbnails get
new URLs. When `THUMB_VERSION` changes, the server rebuilds older thumbnails from the originals in the background;
until then an image keeps its old ones. `thumbSrcSet` lists the sizes an image has, for the browser to pick from.

## Tagger protocol (Eikon → gpubox)
See `shared/src/tagger.ts`:

| Method | Path | Body | Response |
|---|---|---|---|
| GET  | `/health` | | `TaggerHealth` (`embedModel` is null when embeddings are off) |
| POST | `/v1/tag` | Raw image bytes | `TaggerResult`, with the image `embedding` when the tagger has an embedding model |
| POST | `/v1/embed-image` | Raw image bytes | `Embedding` · `404` when embeddings are off |
| POST | `/v1/embed-text` | `TextEmbeddingRequest` (≤ 500 characters) | `Embedding` · `404` when embeddings are off |

Embeddings are L2-normalised and sent as base64 little-endian float16 (`shared/src/vectors.ts`).
With `TAGGER_TOKEN` set, every request needs `Authorization: Bearer <token>`.
