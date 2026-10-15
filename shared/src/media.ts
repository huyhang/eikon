export const THUMB_SIZES = ['sm', 'md', 'lg'] as const;
export type ThumbSize = (typeof THUMB_SIZES)[number];

/**
 * Bumped whenever thumbnails are made differently. Images with older thumbnails are rebuilt in the
 * background, and the version is part of thumbnail URLs so browsers fetch the new files.
 * 2: added md, and full-resolution colour (no chroma subsampling) for sharper line art.
 */
export const THUMB_VERSION = 2;

/** Each thumbnail is the original scaled down (never up) to fit inside its box. */
export const THUMB_BOXES: Record<ThumbSize, { width: number; height: number }> = {
  sm: { width: 1440, height: 480 },
  md: { width: 2048, height: 720 },
  lg: { width: 2048, height: 2048 },
};

/** The sizes an image's thumbnails come in at a given version; md arrived with version 2. */
export function thumbSizesAt(version: number): readonly ThumbSize[] {
  return version >= 2 ? THUMB_SIZES : ['sm', 'lg'];
}

/** Pixel size of a thumbnail of a `width`×`height` image, as the server scales it. */
export function thumbDimensions(
  width: number,
  height: number,
  size: ThumbSize,
): { width: number; height: number } {
  const box = THUMB_BOXES[size];
  const scale = Math.min(1, box.width / width, box.height / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** What a thumbnail URL needs to know about its image; without a version it is taken to be 1. */
export interface ThumbSource {
  id: number;
  thumbVersion?: number;
}

export function thumbUrl(image: ThumbSource, size: ThumbSize): string {
  const version = image.thumbVersion ?? 1;
  // Version 1 URLs carry no query, so thumbnails browsers saved before versioning stay valid.
  return `/media/thumb/${image.id}/${size}${version > 1 ? `?v=${version}` : ''}`;
}

/**
 * A `srcset` offering each of the image's thumbnails by width, so the browser can pick the smallest
 * one that stays sharp at the drawn size and the screen's pixel density. Sizes no wider than a
 * smaller one (small originals are never enlarged) are left out.
 */
export function thumbSrcSet(image: ThumbSource & { width: number; height: number }): string {
  let widest = 0;
  const candidates: string[] = [];
  for (const size of thumbSizesAt(image.thumbVersion ?? 1)) {
    const { width } = thumbDimensions(image.width, image.height, size);
    if (width <= widest) continue;
    widest = width;
    candidates.push(`${thumbUrl(image, size)} ${width}w`);
  }
  return candidates.join(', ');
}

export function originalUrl(imageId: number): string {
  return `/media/original/${imageId}`;
}
