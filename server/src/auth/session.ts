import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'v1';

/**
 * Stateless session tokens: "v1.<issuedAt>.<hmac>". The HMAC key mixes the server secret with
 * the passcode, so changing the passcode signs everyone out.
 */
export class SessionSigner {
  private readonly key: Buffer;

  constructor(secret: string, passcode: string) {
    this.key = createHmac('sha256', secret).update(passcode).digest();
  }

  issue(now: number): string {
    const payload = `${VERSION}.${now}`;
    return `${payload}.${this.sign(payload)}`;
  }

  verify(token: string | undefined): boolean {
    if (!token) return false;
    const lastDot = token.lastIndexOf('.');
    const payload = token.slice(0, lastDot);
    if (lastDot < 0 || !payload.startsWith(`${VERSION}.`)) return false;
    return safeEqual(token.slice(lastDot + 1), this.sign(payload));
  }

  private sign(payload: string): string {
    return createHmac('sha256', this.key).update(payload).digest('base64url');
  }
}

/** Constant-time string comparison (hashes first so lengths never leak). */
export function safeEqual(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

export function isNumericPasscode(passcode: string): boolean {
  return /^\d+$/.test(passcode);
}
