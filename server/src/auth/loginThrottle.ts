import type { Clock } from '../util/clock';

export interface ThrottlePolicy {
  /** Wrong attempts allowed before the first lockout. */
  freeAttempts: number;
  baseLockMs: number;
  maxLockMs: number;
}

export const DEFAULT_THROTTLE: ThrottlePolicy = {
  freeAttempts: 5,
  baseLockMs: 30_000,
  maxLockMs: 15 * 60_000,
};

/** Lockout length after `failures` wrong attempts: 0 until the free attempts run out, then doubling. */
export function lockDuration(failures: number, policy: ThrottlePolicy): number {
  const excess = failures - policy.freeAttempts;
  return excess < 0 ? 0 : Math.min(policy.maxLockMs, policy.baseLockMs * 2 ** excess);
}

/** Single-user app: one global counter slows down guessing from anywhere. */
export class LoginThrottle {
  private failures = 0;
  private lockedUntil = 0;

  constructor(
    private readonly clock: Clock,
    private readonly policy: ThrottlePolicy = DEFAULT_THROTTLE,
  ) {}

  /** Seconds to wait before another attempt is allowed (0 = go ahead). */
  retryAfterSeconds(): number {
    return Math.max(0, Math.ceil((this.lockedUntil - this.clock.now()) / 1000));
  }

  recordFailure(): void {
    this.failures += 1;
    this.lockedUntil = this.clock.now() + lockDuration(this.failures, this.policy);
  }

  recordSuccess(): void {
    this.failures = 0;
    this.lockedUntil = 0;
  }
}
