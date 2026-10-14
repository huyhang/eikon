import { describe, expect, it } from 'vitest';
import { ownsViewer, readViewerParams, withoutViewer, withViewer } from './viewerParams';

describe('viewer params', () => {
  it.each([
    { url: '', expected: { imageId: null, context: null } },
    { url: 'img=12&ctx=all', expected: { imageId: 12, context: 'all' } },
    { url: 'img=abc', expected: { imageId: null, context: null } },
    { url: 'img=-4&ctx=x', expected: { imageId: null, context: 'x' } },
  ])('reads "$url"', ({ url, expected }) => {
    expect(readViewerParams(new URLSearchParams(url))).toEqual(expected);
  });

  it('adds and removes viewer params while keeping others', () => {
    const base = new URLSearchParams('t=sky');
    const opened = withViewer(base, 5, 'search');
    expect(opened.toString()).toBe('t=sky&img=5&ctx=search');
    expect(withoutViewer(opened).toString()).toBe('t=sky');
  });

  it.each([
    { context: 'all', key: 'all', primary: false, expected: true },
    { context: 'recent', key: 'all', primary: true, expected: false },
    { context: null, key: 'all', primary: true, expected: true },
    { context: null, key: 'recent', primary: false, expected: false },
  ])('ownsViewer($context, $key, primary=$primary) → $expected', ({ context, key, primary, expected }) => {
    expect(ownsViewer(context, key, primary)).toBe(expected);
  });
});
