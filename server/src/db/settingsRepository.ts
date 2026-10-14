import type { Settings } from '@eikon/shared';
import type { Database } from './database';

export const DEFAULT_SETTINGS: Settings = { generalThreshold: 0.35, characterThreshold: 0.85 };

/** Keeps only known keys holding numbers in [0, 1]. */
export function sanitizeSettings(input: unknown): Partial<Settings> {
  if (typeof input !== 'object' || input === null) return {};
  const result: Partial<Settings> = {};
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]) {
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1) result[key] = value;
  }
  return result;
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
