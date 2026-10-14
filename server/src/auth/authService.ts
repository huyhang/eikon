import type { AuthMethod, AuthStatus } from '@eikon/shared';
import type { Clock } from '../util/clock';
import type { LoginThrottle } from './loginThrottle';
import type { SecretStore } from './secretStore';
import { isNumericPasscode, safeEqual, type SessionSigner } from './session';
import type { TailnetIdentity } from './tailscaleIdentity';

/** Sessions from "Remember this device" last about as long as browsers keep cookies (~400 days). */
export const REMEMBER_TTL_MS = 400 * 24 * 60 * 60 * 1000;
/** Other sessions end after half a day even if the browser keeps its cookie. */
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

export type LoginOutcome =
  { ok: true; token: string; ttlMs: number } | { ok: false; retryAfterSeconds: number };

/** What a request presents: its session cookie and, behind `tailscale serve`, the tailnet user. */
export interface Credentials {
  token: string | undefined;
  identity: TailnetIdentity | null;
}

export interface AuthServiceDeps {
  /** Lock-screen passcode; undefined disables passcode sign-in. */
  passcode: string | undefined;
  /** Whether tailnet users may sign in through `tailscale serve` identity headers. */
  tailscaleSignIn: boolean;
  signer: SessionSigner;
  secrets: SecretStore;
  throttle: LoginThrottle;
  clock: Clock;
}

/** Decides who gets in: anyone (nothing configured), passcode sessions, and/or allowed tailnet users. */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  get required(): boolean {
    return Boolean(this.deps.passcode) || this.deps.tailscaleSignIn;
  }

  method({ token, identity }: Credentials): AuthMethod | null {
    if (!this.required) return 'open';
    if (identity && this.deps.tailscaleSignIn) return 'tailscale';
    if (this.deps.passcode && this.deps.signer.verify(token, this.deps.clock.now())) return 'session';
    return null;
  }

  isAuthenticated(credentials: Credentials): boolean {
    return this.method(credentials) !== null;
  }

  status(credentials: Credentials): AuthStatus {
    const method = this.method(credentials);
    const passcode = this.deps.passcode ?? '';
    return {
      required: this.required,
      authenticated: method !== null,
      passcode: passcode !== '',
      numeric: passcode !== '' && isNumericPasscode(passcode),
      method,
      user: method === 'tailscale' && credentials.identity ? credentials.identity : null,
    };
  }

  login(attempt: string, remember: boolean): LoginOutcome {
    const { passcode, throttle, signer, clock } = this.deps;
    const wait = throttle.retryAfterSeconds();
    if (wait > 0) return { ok: false, retryAfterSeconds: wait };
    if (passcode ? safeEqual(attempt, passcode) : !this.required) {
      throttle.recordSuccess();
      const ttlMs = remember ? REMEMBER_TTL_MS : SESSION_TTL_MS;
      return { ok: true, token: signer.issue(clock.now(), ttlMs), ttlMs };
    }
    throttle.recordFailure();
    return { ok: false, retryAfterSeconds: throttle.retryAfterSeconds() };
  }

  /** Invalidates every passcode session on every device by rotating the signing secret. */
  signOutEverywhere(): void {
    this.deps.signer.rekey(this.deps.secrets.rotate());
  }
}
