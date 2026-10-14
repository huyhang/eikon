import type { Settings } from '@eikon/shared';
import type { Database } from './database';

export const DEFAULT_SETTINGS: Settings = {
  generalThreshold: 0.35,
  characterThreshold: 0.85,
  hideDuplicates: true,
};

const unitInterval = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
const isBoolean = (v: unknown) => typeof v === 'boolean';

const VALIDATORS: { [K in keyof Settings]: (value: unknown) => boolean } = {
  generalThreshold: unitInterval,
  characterThreshold: unitInterval,
  hideDuplicates: isBoolean,
};

/** Keeps only known keys holding valid values. */
export function sanitizeSettings(input: unknown): Partial<Settings> {
  if (typeof input !== 'object' || input === null) return {};
  const raw = input as Record<string, unknown>;
  const entries = Object.entries(VALIDATORS).filter(([key, valid]) => valid(raw[key]));
  return Object.fromEntries(entries.map(([key]) => [key, raw[key]])) as Partial<Settings>;
}

export class SettingsRepository {
  private cache: Settings | undefined;

  constructor(private readonly db: Database) {}

  get(): Settings {
    if (!this.cache) {
      const rows = this.db.all<{ key: string; value: string }>('SELECT key, value FROM settings');
      const stored = sanitizeSettings(Object.fromEntries(rows.map((r) => [r.key, JSON.parse(r.value)])));
      this.cache = { ...DEFAULT_SETTINGS, ...stored };
    }
    return this.cache;
  }

  update(patch: Partial<Settings>): Settings {
    this.db.transaction(() =>
      Object.entries(patch).forEach(([key, value]) =>
        this.db.run(
          'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
          key,
          JSON.stringify(value),
        ),
      ),
    );
    this.cache = undefined;
    return this.get();
  }
}
