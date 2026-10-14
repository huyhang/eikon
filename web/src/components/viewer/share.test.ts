import { describe, expect, it, vi } from 'vitest';
import type { ImageDetail } from '@eikon/shared';
import { fileNameOf, shareMessage, shareOrDownload, type ShareEnvironment } from './share';

const detail = {
  id: 7,
  format: 'png',
  files: [{ path: 'Illustrators/Wlop/sunset.png', group: { id: 1, kind: 'illustrator', name: 'Wlop' } }],
} as ImageDetail;

function env(options: {
  share?: ((data: ShareData) => Promise<void>) | undefined;
  canShare?: boolean;
  fetchResult?: 'ok' | '404' | 'offline';
}) {
  const clicks: string[] = [];
  const document = {
    createElement: () => ({
      href: '',
      download: '',
      click() {
        clicks.push(this.download);
      },
      remove() {},
    }),
    body: { appendChild: () => {} },
  } as unknown as Document;
  const fetchImpl = vi.fn(async () => {
    if (options.fetchResult === 'offline') throw new TypeError('Failed to fetch');
    return new Response(new Blob(['png']), { status: options.fetchResult === '404' ? 404 : 200 });
  });
  const environment: ShareEnvironment = {
    navigator: { share: options.share as Navigator['share'], canShare: () => options.canShare ?? true },
    fetch: fetchImpl as unknown as typeof fetch,
    document,
  };
  return { environment, clicks, fetchImpl };
}

const rejectWith = (name: string) => async () => {
  throw new DOMException('nope', name);
};

describe('shareOrDownload', () => {
  it.each([
    {
      label: 'no Web Share API',
      share: undefined,
      canShare: true,
      fetchResult: 'ok' as const,
      outcome: 'downloaded',
      downloads: 1,
    },
    {
      label: 'shared',
      share: async () => {},
      canShare: true,
      fetchResult: 'ok' as const,
      outcome: 'shared',
      downloads: 0,
    },
    {
      label: 'user cancelled the sheet',
      share: rejectWith('AbortError'),
      canShare: true,
      fetchResult: 'ok' as const,
      outcome: 'cancelled',
      downloads: 0,
    },
    {
      label: 'share no longer allowed after the fetch',
      share: rejectWith('NotAllowedError'),
      canShare: true,
      fetchResult: 'ok' as const,
      outcome: 'downloaded',
      downloads: 1,
    },
    {
      label: 'files cannot be shared',
      share: async () => {},
      canShare: false,
      fetchResult: 'ok' as const,
      outcome: 'downloaded',
      downloads: 1,
    },
    {
      label: 'original missing (404)',
      share: async () => {},
      canShare: true,
      fetchResult: '404' as const,
      outcome: 'failed',
      downloads: 0,
    },
    {
      label: 'offline',
      share: async () => {},
      canShare: true,
      fetchResult: 'offline' as const,
      outcome: 'failed',
      downloads: 0,
    },
  ])('$label → $outcome', async ({ share, canShare, fetchResult, outcome, downloads }) => {
    const { environment, clicks } = env({ share, canShare, fetchResult });
    expect(await shareOrDownload(detail, environment)).toBe(outcome);
    expect(clicks).toEqual(Array.from({ length: downloads }, () => 'sunset.png'));
  });
});

describe('helpers', () => {
  it.each([
    { d: detail, expected: 'sunset.png' },
    { d: { ...detail, files: [] }, expected: 'eikon-7.png' },
  ])('fileNameOf → $expected', ({ d, expected }) => {
    expect(fileNameOf(d)).toBe(expected);
  });

  it.each([
    { outcome: 'failed' as const, expected: 'error' },
    { outcome: 'downloaded' as const, expected: 'info' },
    { outcome: 'shared' as const, expected: null },
    { outcome: 'cancelled' as const, expected: null },
  ])('shareMessage($outcome) tone → $expected', ({ outcome, expected }) => {
    expect(shareMessage(outcome, detail)?.tone ?? null).toBe(expected);
  });
});
