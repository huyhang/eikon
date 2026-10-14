import { originalUrl, type ImageDetail } from '@eikon/shared';

export function fileNameOf(detail: ImageDetail): string {
  const path = detail.files[0]?.path ?? `eikon-${detail.id}.${detail.format}`;
  return path.split('/').pop() ?? path;
}

export interface ShareEnvironment {
  navigator: Pick<Navigator, 'share' | 'canShare'>;
  fetch: typeof fetch;
  document: Document;
}

/** 'failed' means the original could not be fetched; nothing was shared or downloaded. */
export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled' | 'failed';

const isAbort = (error: unknown) => error instanceof DOMException && error.name === 'AbortError';

async function fetchOriginal(detail: ImageDetail, env: ShareEnvironment): Promise<File | null> {
  try {
    const response = await env.fetch(originalUrl(detail.id));
    if (!response.ok) return null;
    const blob = await response.blob();
    return new File([blob], fileNameOf(detail), { type: blob.type });
  } catch {
    return null; // offline or the server went away; reported to the user as 'failed'
  }
}

function download(detail: ImageDetail, env: ShareEnvironment): 'downloaded' {
  const link = env.document.createElement('a');
  link.href = originalUrl(detail.id);
  link.download = fileNameOf(detail);
  env.document.body.appendChild(link);
  link.click();
  link.remove();
  return 'downloaded';
}

/** Native share sheet with the original file when supported (iOS: Save Image), otherwise a download. */
export async function shareOrDownload(detail: ImageDetail, env: ShareEnvironment): Promise<ShareOutcome> {
  if (typeof env.navigator.share !== 'function') return download(detail, env);
  const file = await fetchOriginal(detail, env);
  if (!file) return 'failed';
  if (!env.navigator.canShare?.({ files: [file] })) return download(detail, env);
  try {
    await env.navigator.share({ files: [file] });
    return 'shared';
  } catch (error) {
    if (isAbort(error)) return 'cancelled';
    // Typically NotAllowedError: the browser no longer counts the tap as a user gesture after the
    // fetch. A download still gets the file to the user.
    return download(detail, env);
  }
}

/** What to tell the user after sharing, if anything. */
export function shareMessage(
  outcome: ShareOutcome,
  detail: ImageDetail,
): { text: string; tone: 'info' | 'error' } | null {
  if (outcome === 'failed')
    return { text: 'Couldn’t load the original image. Check your connection.', tone: 'error' };
  if (outcome === 'downloaded') return { text: `Downloading ${fileNameOf(detail)}`, tone: 'info' };
  return null;
}
