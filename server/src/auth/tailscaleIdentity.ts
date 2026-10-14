/** A tailnet user, as reported by `tailscale serve` in its identity headers. */
export interface TailnetIdentity {
  login: string;
  name: string | null;
}

export interface TailscaleTrust {
  /** Peer addresses allowed to assert identity: the `tailscale serve` proxy as seen from Eikon. */
  proxies: string[];
  /** Logins that may use the app; "*" allows every tailnet user. Empty disables identity sign-in. */
  users: string[];
}

type Headers = Record<string, string | string[] | undefined>;

/** "::ffff:127.0.0.1" and "127.0.0.1" are the same peer. */
export function normalizeAddress(address: string | undefined): string {
  return (address ?? '').replace(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/, '$1');
}

/**
 * Decodes RFC 2047 "Q" encoded words, which `tailscale serve` uses for non-ASCII values
 * (e.g. "=?utf-8?q?Jos=C3=A9?="). Plain values pass through unchanged.
 */
export function decodeHeaderValue(value: string): string {
  return value.replace(/=\?utf-8\?q\?([^?]*)\?=/gi, (_, text: string) => {
    const bytes: number[] = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]!;
      if (ch === '_') bytes.push(0x20);
      else if (ch === '=' && /^[0-9a-f]{2}$/i.test(text.slice(i + 1, i + 3))) {
        bytes.push(parseInt(text.slice(i + 1, i + 3), 16));
        i += 2;
      } else bytes.push(ch.charCodeAt(0));
    }
    return Buffer.from(bytes).toString('utf8');
  });
}

function header(headers: Headers, name: string): string | undefined {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
}

export function isAllowedLogin(login: string, users: string[]): boolean {
  const wanted = login.toLowerCase();
  return users.some((user) => user === '*' || user.toLowerCase() === wanted);
}

/**
 * The tailnet user behind a request, or null. Identity headers are believed only when the request
 * comes straight from a trusted proxy — anyone else could simply set them — and only for allowed logins.
 */
export function tailscaleIdentity(
  headers: Headers,
  remoteAddress: string | undefined,
  trust: TailscaleTrust,
): TailnetIdentity | null {
  if (trust.users.length === 0) return null;
  if (!trust.proxies.map(normalizeAddress).includes(normalizeAddress(remoteAddress))) return null;
  const login = decodeHeaderValue(header(headers, 'tailscale-user-login') ?? '').trim();
  if (!login || !isAllowedLogin(login, trust.users)) return null;
  const name = decodeHeaderValue(header(headers, 'tailscale-user-name') ?? '').trim();
  return { login, name: name || null };
}
