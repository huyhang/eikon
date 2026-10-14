const countFormatter = new Intl.NumberFormat('en-US');
const compactFormatter = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export function formatCount(n: number): string {
  return countFormatter.format(n);
}

export function formatCompact(n: number): string {
  return n < 10_000 ? formatCount(n) : compactFormatter.format(n);
}

export function pluralize(n: number, singular: string, plural = `${singular}s`): string {
  return `${formatCount(n)} ${n === 1 ? singular : plural}`;
}

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

const byteDigits = (value: number, unit: number) => (unit === 0 || value >= 100 ? 0 : 1);

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  let value = bytes;
  let unit = 0;
  const last = BYTE_UNITS.length - 1;
  // Move up a unit while the *rounded* value would read 1024 or more (1048575 B is "1.0 MB", not "1024 KB").
  while (unit < last && Number(value.toFixed(byteDigits(value, unit))) >= 1024) {
    value /= 1024;
    unit++;
  }
  return `${value.toFixed(byteDigits(value, unit))} ${BYTE_UNITS[unit]}`;
}

export function formatDate(epochMs: number, locale = 'en-US'): string {
  return new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', day: 'numeric' }).format(epochMs);
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(epochMs: number, now: number): string {
  const diff = Math.max(0, now - epochMs);
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} min ago`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h ago`;
  if (diff < 30 * DAY) return pluralize(Math.floor(diff / DAY), 'day') + ' ago';
  return formatDate(epochMs);
}

export function formatPercent(fraction: number): string {
  return `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
}

export function formatDimensions(width: number, height: number): string {
  return `${width} × ${height}`;
}
