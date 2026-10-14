import { describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/authService';
import { lockDuration, LoginThrottle, DEFAULT_THROTTLE } from '../src/auth/loginThrottle';
import { isNumericPasscode, safeEqual, SessionSigner } from '../src/auth/session';
import { FakeClock } from './support/fakes';

describe('SessionSigner', () => {
  const signer = new SessionSigner('secret', '1234');
  const token = signer.issue(42);

  it.each([
    ['its own token', token, true],
    ['undefined', undefined, false],
    ['garbage', 'nope', false],
    ['tampered timestamp', token.replace('.42.', '.43.'), false],
    ['token from another passcode', new SessionSigner('secret', '9999').issue(42), false],
    ['token from another secret', new SessionSigner('other', '1234').issue(42), false],
  ])('verifies %s → %s', (_, candidate, expected) => {
    expect(signer.verify(candidate)).toBe(expected);
  });
});

describe('helpers', () => {
  it.each([
    ['1234', true],
    ['0000000', true],
    ['12a4', false],
    ['', false],
  ])('isNumericPasscode(%j) → %s', (input, expected) => {
    expect(isNumericPasscode(input)).toBe(expected);
  });

  it.each([
    ['a', 'a', true],
    ['a', 'b', false],
    ['short', 'longer', false],
  ])('safeEqual(%j, %j) → %s', (a, b, expected) => {
    expect(safeEqual(a, b)).toBe(expected);
  });

  it.each([
    [0, 0],
    [4, 0],
    [5, 30_000],
    [6, 60_000],
    [20, 15 * 60_000],
  ])('lockDuration after %i failures → %i ms', (failures, expected) => {
    expect(lockDuration(failures, DEFAULT_THROTTLE)).toBe(expected);
  });
});

describe('AuthService', () => {
  function service(passcode: string | undefined) {
    const clock = new FakeClock(0);
    const auth = new AuthService(
      passcode,
      new SessionSigner('s', passcode ?? ''),
      new LoginThrottle(clock),
      clock,
    );
    return { auth, clock };
  }

  it('lets everyone in when no passcode is configured', () => {
    const { auth } = service(undefined);
    expect(auth.status(undefined)).toEqual({ required: false, authenticated: true, numeric: false });
  });

  it('issues a working token for the right passcode', () => {
    const { auth } = service('2468');
    const outcome = auth.login('2468');
    expect(outcome.ok).toBe(true);
    expect(auth.status(outcome.ok ? outcome.token : undefined)).toEqual({
      required: true,
      authenticated: true,
      numeric: true,
    });
  });

  it('locks out after repeated failures, then recovers', () => {
    const { auth, clock } = service('secret');
    for (let i = 0; i < 4; i++) expect(auth.login('wrong')).toEqual({ ok: false, retryAfterSeconds: 0 });
    expect(auth.login('wrong')).toEqual({ ok: false, retryAfterSeconds: 30 });
    expect(auth.login('secret')).toEqual({ ok: false, retryAfterSeconds: 30 });
    clock.advance(30_000);
    expect(auth.login('secret').ok).toBe(true);
  });
});
