import { describe, expect, it } from 'vitest';
import { buildBmp, placeholderAverageColor, placeholderToDataUrl } from './placeholder';

const toBase64 = (bytes: number[]) => btoa(String.fromCharCode(...bytes));
const solid = (r: number, g: number, b: number) =>
  toBase64(Array.from({ length: 9 }, () => [r, g, b]).flat());

function decodeDataUrl(url: string): Uint8Array {
  const binary = atob(url.split(',')[1]!);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

describe('buildBmp', () => {
  const rgb = Uint8Array.from({ length: 27 }, (_, i) => i);
  const bmp = buildBmp(rgb);
  const view = new DataView(bmp.buffer);

  it.each([
    { field: 'magic', read: () => String.fromCharCode(bmp[0]!, bmp[1]!), expected: 'BM' },
    { field: 'file size', read: () => view.getUint32(2, true), expected: 54 + 36 },
    { field: 'pixel offset', read: () => view.getUint32(10, true), expected: 54 },
    { field: 'width', read: () => view.getInt32(18, true), expected: 3 },
    { field: 'height', read: () => view.getInt32(22, true), expected: 3 },
    { field: 'bits per pixel', read: () => view.getUint16(28, true), expected: 24 },
  ])('writes $field', ({ read, expected }) => {
    expect(read()).toBe(expected);
  });

  it.each([
    // top-left source pixel (0,1,2) lands in the last stored row, as BGR
    { name: 'top-left', offset: 54 + 2 * 12, expected: [2, 1, 0] },
    // bottom-left source pixel (18,19,20) is the first stored row
    { name: 'bottom-left', offset: 54, expected: [20, 19, 18] },
    // bottom-right source pixel (24,25,26)
    { name: 'bottom-right', offset: 54 + 6, expected: [26, 25, 24] },
  ])('stores the $name pixel bottom-up in BGR order', ({ offset, expected }) => {
    expect(Array.from(bmp.slice(offset, offset + 3))).toEqual(expected);
  });
});

describe('placeholderToDataUrl', () => {
  it.each([
    { name: 'empty', input: '' },
    { name: 'too short', input: toBase64([1, 2, 3]) },
    { name: 'not base64', input: '%%%' },
  ])('rejects $name input', ({ input }) => {
    expect(placeholderToDataUrl(input)).toBeNull();
  });

  it('produces a BMP data URL for a valid placeholder', () => {
    const url = placeholderToDataUrl(solid(255, 0, 0))!;
    expect(url.startsWith('data:image/bmp;base64,')).toBe(true);
    const bytes = decodeDataUrl(url);
    expect(Array.from(bytes.slice(54, 57))).toEqual([0, 0, 255]);
  });
});

describe('placeholderAverageColor', () => {
  it.each([
    { input: solid(10, 20, 30), expected: 'rgb(10, 20, 30)' },
    { input: solid(255, 255, 255), expected: 'rgb(255, 255, 255)' },
    { input: 'bad', expected: 'rgb(40, 40, 44)' },
  ])('$expected', ({ input, expected }) => {
    expect(placeholderAverageColor(input)).toBe(expected);
  });
});
