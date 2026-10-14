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

/** Native share sheet with the original file when supported (iOS: Save Image), otherwise a download. */
export async function shareOrDownload(
  detail: ImageDetail,
  env: ShareEnvironment,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const url = originalUrl(detail.id);
  const name = fileNameOf(detail);
  if (typeof env.navigator.share === 'function') {
    try {
      const blob = await (await env.fetch(url)).blob();
      const file = new File([blob], name, { type: blob.type });
      if (env.navigator.canShare?.({ files: [file] })) {
        await env.navigator.share({ files: [file] });
        return 'shared';
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  const link = env.document.createElement('a');
  link.href = url;
  link.download = name;
  env.document.body.appendChild(link);
  link.click();
  link.remove();
  return 'downloaded';
}
