/** DOM hook used by the viewer to find a grid tile for its expand/collapse animation. */
export function tileKey(contextKey: string, imageId: number): string {
  return `${contextKey}:${imageId}`;
}

export function findTileElement(contextKey: string, imageId: number): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-tile-key="${CSS.escape(tileKey(contextKey, imageId))}"]`);
}
