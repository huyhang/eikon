import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'v2';

/**
 * Stateless session tokens: "v2.<issuedAt>.<expiresAt>.<hmac>". The HMAC key mixes the server secret
 * with the passcode, so changing the passcode — or rotating the secret — signs everyone out.
 */
export class SessionSigner {
  private key: Buffer;

  constructor(
    secret: string,
    private readonly passcode: string,
  ) {
    this.key = deriveKey(secret, passcode);
  }

  issue(now: number, ttlMs: number): string {
    const payload = `${VERSION}.${now}.${now + ttlMs}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string | undefined, now: number): boolean {
    const parsed = parseToken(token);
    if (!parsed || !safeEqual(parsed.signature, this.sign(parsed.payload))) return false;
    return parsed.issuedAt <= now && now < parsed.expiresAt;
  }

  /** Switches to a new secret; every token signed with the old one stops working. */
  rekey(secret: string): void {
    this.key = deriveKey(secret, this.passcode);
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }
}

function deriveKey(secret: string, passcode: string): Buffer {
  return createHmac('sha256', secret).update(passcode).digest();
}

interface ParsedToken {
  payload: string;
  issuedAt: number;
  expiresAt: number;
  signature: string;
}

function parseToken(token: string | undefined): ParsedToken | null {
  const parts = token?.split('.') ?? [];
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  const [version, issued, expires, signature] = parts as [string, string, string, string];
  const issuedAt = Number(issued);
  const expiresAt = Number(expires);
  if (!Number.isSafeInteger(issuedAt) || !Number.isSafeInteger(expiresAt)) return null;
  return { payload: `${version}.${issued}.${expires}`, issuedAt, expiresAt, signature };
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function isNumericPasscode(passcode: string): boolean {
  return /^\d+$/.test(passcode);
}
