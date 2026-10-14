export interface ScoredId {
  id: number;
  /** Cosine similarity in [-1, 1]. */
  score: number;
}

const SCALE = 127;

/**
 * Unit vectors held in memory as int8 (1 byte per dimension), searched by brute force. 100 000
 * CLIP-large vectors take ~77 MB and a query scans them in tens of milliseconds — plenty for one user.
 */
export class VectorIndex {
  private readonly slots = new Map<number, number>();
  private ids: number[] = [];
  private data: Int8Array;

  constructor(readonly dims: number) {
    this.data = new Int8Array(dims * 64);
  }

  get size(): number {
    return this.ids.length;
  }

  has(id: number): boolean {
    return this.slots.has(id);
  }

  /** Adds or replaces a vector; it should already be normalised. */
  set(id: number, vector: ArrayLike<number>): void {
    if (vector.length !== this.dims)
      throw new Error(`expected ${this.dims} dimensions, got ${vector.length}`);
    let slot = this.slots.get(id);
    if (slot === undefined) {
      slot = this.ids.length;
      this.ensureCapacity(slot + 1);
      this.ids.push(id);
      this.slots.set(id, slot);
    }
    const offset = slot * this.dims;
    for (let i = 0; i < this.dims; i++) {
      this.data[offset + i] = Math.max(-SCALE, Math.min(SCALE, Math.round(vector[i]! * SCALE)));
    }
  }

  delete(id: number): void {
    const slot = this.slots.get(id);
    if (slot === undefined) return;
    const last = this.ids.length - 1;
    const lastId = this.ids[last]!;
    if (slot !== last) {
      this.data.copyWithin(slot * this.dims, last * this.dims, (last + 1) * this.dims);
      this.ids[slot] = lastId;
      this.slots.set(lastId, slot);
    }
    this.ids.pop();
    this.slots.delete(id);
  }

  /** The stored (de-quantised) vector of an id. */
  get(id: number): Float32Array | undefined {
    const slot = this.slots.get(id);
    if (slot === undefined) return undefined;
    return Float32Array.from(this.data.subarray(slot * this.dims, (slot + 1) * this.dims), (v) => v / SCALE);
  }

  /** The `limit` most similar ids, best first, optionally restricted by `accept`. */
  nearest(query: ArrayLike<number>, limit: number, accept: (id: number) => boolean = () => true): ScoredId[] {
    const q = Int8Array.from({ length: this.dims }, (_unused, i) =>
      Math.max(-SCALE, Math.min(SCALE, Math.round(query[i]! * SCALE))),
    );
    const top: ScoredId[] = [];
    for (let slot = 0; slot < this.ids.length; slot++) {
      const id = this.ids[slot]!;
      if (!accept(id)) continue;
      const score = this.dot(q, slot) / (SCALE * SCALE);
      if (top.length < limit) insertSorted(top, { id, score });
      else if (score > top[top.length - 1]!.score) {
        top.pop();
        insertSorted(top, { id, score });
      }
    }
    return top;
  }

  private dot(q: Int8Array, slot: number): number {
    const offset = slot * this.dims;
    let sum = 0;
    for (let i = 0; i < this.dims; i++) sum += q[i]! * this.data[offset + i]!;
    return sum;
  }

  private ensureCapacity(count: number): void {
    if (count * this.dims <= this.data.length) return;
    const grown = new Int8Array(Math.max(count * this.dims, this.data.length * 2));
    grown.set(this.data);
    this.data = grown;
  }
}

/** Keeps `list` sorted by descending score (small lists only: limit is at most a few hundred). */
function insertSorted(list: ScoredId[], item: ScoredId): void {
  let i = list.length;
  while (i > 0 && list[i - 1]!.score < item.score) i--;
  list.splice(i, 0, item);
}
