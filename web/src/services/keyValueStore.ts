/** Minimal persistence boundary for device-local preferences. */
export interface KeyValueStore {
  get<T>(key: string, fallback: T): T;
  set<T>(key: string, value: T): void;
}

export class LocalStorageStore implements KeyValueStore {
  private readonly storage: Storage;
  private readonly prefix: string;

  constructor(storage: Storage, prefix = 'eikon.') {
    this.storage = storage;
    this.prefix = prefix;
  }

  get<T>(key: string, fallback: T): T {
    try {
      const raw = this.storage.getItem(this.prefix + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  }

  set<T>(key: string, value: T): void {
    try {
      this.storage.setItem(this.prefix + key, JSON.stringify(value));
    } catch {
      // Private mode / quota: preferences simply won't persist.
    }
  }
}

export class MemoryStore implements KeyValueStore {
  private readonly values = new Map<string, unknown>();

  get<T>(key: string, fallback: T): T {
    return this.values.has(key) ? (this.values.get(key) as T) : fallback;
  }

  set<T>(key: string, value: T): void {
    this.values.set(key, value);
  }
}
