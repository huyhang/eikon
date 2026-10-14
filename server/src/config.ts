import path from 'node:path';

export interface Config {
  host: string;
  port: number;
  libraryDir: string;
  dataDir: string;
  webDistDir: string | undefined;
  taggerUrl: string;
  taggerToken: string | undefined;
  passcode: string | undefined;
  /** Tailnet logins allowed to sign in via `tailscale serve` identity headers ("*" = anyone). */
  tailscaleUsers: string[];
  /** Peer addresses trusted to assert identity and X-Forwarded-* headers. */
  trustedProxies: string[];
  cookieSecure: boolean;
  scanIntervalMs: number;
  processConcurrency: number;
  tagConcurrency: number;
  logLevel: string;
  prettyLogs: boolean;
}

export type Env = Record<string, string | undefined>;

export class ConfigError extends Error {}

function integer(env: Env, key: string, fallback: number, min = 1): number {
  const raw = env[key];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min)
    throw new ConfigError(`${key} must be an integer ≥ ${min}, got "${raw}"`);
  return value;
}

function boolean(env: Env, key: string, fallback: boolean): boolean {
  const raw = env[key]?.toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function optional(env: Env, key: string): string | undefined {
  const value = env[key]?.trim();
  return value ? value : undefined;
}

function list(env: Env, key: string, fallback: string[] = []): string[] {
  const raw = optional(env, key);
  if (raw === undefined) return fallback;
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function url(env: Env, key: string, fallback: string): string {
  const value = optional(env, key) ?? fallback;
  if (!URL.canParse(value)) throw new ConfigError(`${key} must be a URL, got "${value}"`);
  return value;
}

/** Reads EIKON_* environment variables; defaults suit the Docker image. */
export function parseConfig(env: Env, cwd = process.cwd()): Config {
  const resolve = (p: string) => path.resolve(cwd, p);
  return {
    host: optional(env, 'EIKON_HOST') ?? '0.0.0.0',
    port: integer(env, 'EIKON_PORT', 8080),
    libraryDir: resolve(optional(env, 'EIKON_LIBRARY_DIR') ?? '/library'),
    dataDir: resolve(optional(env, 'EIKON_DATA_DIR') ?? '/data'),
    webDistDir: optional(env, 'EIKON_WEB_DIST') ? resolve(env.EIKON_WEB_DIST!.trim()) : undefined,
    taggerUrl: url(env, 'EIKON_TAGGER_URL', 'http://gpubox:7860'),
    taggerToken: optional(env, 'EIKON_TAGGER_TOKEN'),
    passcode: optional(env, 'EIKON_PASSCODE'),
    tailscaleUsers: list(env, 'EIKON_TAILSCALE_USERS'),
    trustedProxies: list(env, 'EIKON_TRUSTED_PROXIES', ['127.0.0.1', '::1']),
    cookieSecure: boolean(env, 'EIKON_COOKIE_SECURE', false),
    scanIntervalMs: integer(env, 'EIKON_SCAN_INTERVAL_MINUTES', 5) * 60_000,
    processConcurrency: integer(env, 'EIKON_PROCESS_CONCURRENCY', 2),
    tagConcurrency: integer(env, 'EIKON_TAG_CONCURRENCY', 8),
    logLevel: optional(env, 'EIKON_LOG_LEVEL') ?? 'info',
    prettyLogs: boolean(env, 'EIKON_PRETTY_LOGS', false),
  };
}
