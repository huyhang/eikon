/** Embedding vectors travel as base64 of little-endian float16 values: 2 bytes per dimension. */

export function encodeVector(values: ArrayLike<number>): string {
  const view = new DataView(new ArrayBuffer(values.length * 2));
  for (let i = 0; i < values.length; i++) view.setFloat16(i * 2, values[i]!, true);
  let binary = '';
  for (const byte of new Uint8Array(view.buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}

/** Reads little-endian float16 values; throws on an odd byte count. */
export function vectorFromFloat16Bytes(bytes: Uint8Array): Float32Array {
  if (bytes.length % 2 !== 0) throw new Error('vector has an odd number of bytes');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Float32Array.from({ length: bytes.length / 2 }, (_unused, i) => view.getFloat16(i * 2, true));
}

/** Inverse of encodeVector; throws on malformed input. */
export function decodeVector(base64: string): Float32Array {
  return vectorFromFloat16Bytes(base64ToBytes(base64));
}

/** Scales a vector to unit length (cosine similarity then becomes a dot product). */
export function normalize(values: ArrayLike<number>): Float32Array {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]! * values[i]!;
  const norm = Math.sqrt(sum) || 1;
  return Float32Array.from(values, (v) => v / norm);
}
