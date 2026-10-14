export const THUMB_SIZES = ['sm', 'lg'] as const;
export type ThumbSize = (typeof THUMB_SIZES)[number];

export function thumbUrl(imageId: number, size: ThumbSize): string {
  return `/media/thumb/${imageId}/${size}`;
}

export function originalUrl(imageId: number): string {
  return `/media/original/${imageId}`;
}
