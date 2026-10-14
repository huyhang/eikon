/** URL contract for the viewer: ?img=<id>&ctx=<collection key>. */
export const VIEWER_IMAGE_PARAM = 'img';
export const VIEWER_CONTEXT_PARAM = 'ctx';

export function readViewerParams(params: URLSearchParams): {
  imageId: number | null;
  context: string | null;
} {
  const id = Number(params.get(VIEWER_IMAGE_PARAM));
  return {
    imageId: Number.isInteger(id) && id > 0 ? id : null,
    context: params.get(VIEWER_CONTEXT_PARAM),
  };
}

export function withViewer(params: URLSearchParams, imageId: number, context: string): URLSearchParams {
  const next = new URLSearchParams(params);
  next.set(VIEWER_IMAGE_PARAM, String(imageId));
  next.set(VIEWER_CONTEXT_PARAM, context);
  return next;
}

export function withoutViewer(params: URLSearchParams): URLSearchParams {
  const next = new URLSearchParams(params);
  next.delete(VIEWER_IMAGE_PARAM);
  next.delete(VIEWER_CONTEXT_PARAM);
  return next;
}

/**
 * A collection owns the open viewer when the context matches, or — for deep links without
 * a context — when it is the page's primary collection.
 */
export function ownsViewer(context: string | null, contextKey: string, primary: boolean): boolean {
  return context === contextKey || (context === null && primary);
}
