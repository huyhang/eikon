const SIDE = 3;
const PIXEL_BYTES = SIDE * SIDE * 3;
const ROW_STRIDE = Math.ceil((SIDE * 3) / 4) * 4;
const HEADER_BYTES = 14 + 40;

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Builds a 24-bit bottom-up BMP from row-major, top-left-first RGB pixels. */
export function buildBmp(rgb: Uint8Array, side = SIDE): Uint8Array {
  const stride = Math.ceil((side * 3) / 4) * 4;
  const pixelBytes = stride * side;
  const out = new Uint8Array(HEADER_BYTES + pixelBytes);
  const view = new DataView(out.buffer);
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, out.length, true);
  view.setUint32(10, HEADER_BYTES, true);
  view.setUint32(14, 40, true);
  view.setInt32(18, side, true);
  view.setInt32(22, side, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(34, pixelBytes, true);
  for (let y = 0; y < side; y++) {
    const rowStart = HEADER_BYTES + (side - 1 - y) * stride;
    for (let x = 0; x < side; x++) {
      const src = (y * side + x) * 3;
      const dst = rowStart + x * 3;
      out[dst] = rgb[src + 2] ?? 0;
      out[dst + 1] = rgb[src + 1] ?? 0;
      out[dst + 2] = rgb[src] ?? 0;
    }
  }
  return out;
}

const cache = new Map<string, string>();

/** Turns the server's 3x3 RGB placeholder into a data URL that browsers upscale smoothly. */
export function placeholderToDataUrl(placeholder: string): string | null {
  const cached = cache.get(placeholder);
  if (cached) return cached;
  let rgb: Uint8Array;
  try {
    rgb = decodeBase64(placeholder);
  } catch {
    return null;
  }
  if (rgb.length !== PIXEL_BYTES) return null;
  const url = `data:image/bmp;base64,${encodeBase64(buildBmp(rgb))}`;
  cache.set(placeholder, url);
  return url;
}

/** Average colour of the placeholder, used as a solid fallback (e.g. in mosaics). */
export function placeholderAverageColor(placeholder: string): string {
  try {
    const rgb = decodeBase64(placeholder);
    if (rgb.length !== PIXEL_BYTES) return 'rgb(40, 40, 44)';
    const sum = [0, 0, 0];
    for (let i = 0; i < rgb.length; i++) sum[i % 3]! += rgb[i]!;
    const n = SIDE * SIDE;
    return `rgb(${Math.round(sum[0]! / n)}, ${Math.round(sum[1]! / n)}, ${Math.round(sum[2]! / n)})`;
  } catch {
    return 'rgb(40, 40, 44)';
  }
}

export const PLACEHOLDER_ROW_STRIDE = ROW_STRIDE;
