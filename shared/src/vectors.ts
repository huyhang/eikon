/** Embedding vectors travel as base64 of little-endian float16 values: 2 bytes per dimension. */

export function encodeVector(values: ArrayLike<number>): string {
  const view = new DataView(new ArrayBuffer(values.length * 2));
  for (let i = 0; i < values.length; i++) view.setFloat16(i * 2, values[i]!, true);
  let binary = '';
  for (const byte of new Uint8Array(view.buffer)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Inverse of encodeVector; throws on malformed input. */
export function decodeVector(base64: string): Float32Array {
  const binary = atob(base64);
  if (binary.length % 2 !== 0) throw new Error('vector has an odd number of bytes');
  const view = new DataView(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) view.setUint8(i, binary.charCodeAt(i));
  const out = new Float32Array(binary.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getFloat16(i * 2, true);
  return out;
}

/** Scales a vector to unit length (cosine similarity then becomes a dot product). */
export function normalize(values: ArrayLike<number>): Float32Array {
  let sum = 0;
  for (let i = 0; i < values.length; i++) sum += values[i]! * values[i]!;
  const norm = Math.sqrt(sum) || 1;
  return Float32Array.from(values, (v) => v / norm);
}
