import type { AuthStatus } from '@eikon/shared';
import type { Clock } from '../util/clock';
import type { LoginThrottle } from './loginThrottle';
import { isNumericPasscode, safeEqual, type SessionSigner } from './session';

export type LoginOutcome = { ok: true; token: string } | { ok: false; retryAfterSeconds: number };

/** Passcode gate. With no passcode configured, everyone is let in. */
export class AuthService {
  constructor(
    private readonly passcode: string | undefined,
    private readonly signer: SessionSigner,
    private readonly throttle: LoginThrottle,
    private readonly clock: Clock,
  ) {}

  get required(): boolean {
    return Boolean(this.passcode);
  }

  isAuthenticated(token: string | undefined): boolean {
    return !this.required || this.signer.verify(token);
  }

  status(token: string | undefined): AuthStatus {
    return {
      required: this.required,
      authenticated: this.isAuthenticated(token),
      numeric: this.required && isNumericPasscode(this.passcode ?? ''),
    };
  }

  login(attempt: string): LoginOutcome {
    const wait = this.throttle.retryAfterSeconds();
    if (wait > 0) return { ok: false, retryAfterSeconds: wait };
    if (!this.passcode || safeEqual(attempt, this.passcode)) {
      this.throttle.recordSuccess();
      return { ok: true, token: this.signer.issue(this.clock.now()) };
    }
    this.throttle.recordFailure();
    return { ok: false, retryAfterSeconds: this.throttle.retryAfterSeconds() };
  }
}
