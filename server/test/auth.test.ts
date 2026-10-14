import { describe, expect, it } from 'vitest';
import { AuthService, REMEMBER_TTL_MS, SESSION_TTL_MS, type Credentials } from '../src/auth/authService';
import { lockDuration, LoginThrottle, DEFAULT_THROTTLE } from '../src/auth/loginThrottle';
import { MemorySecretStore } from '../src/auth/secretStore';
import { isNumericPasscode, safeEqual, SessionSigner } from '../src/auth/session';
import {
  decodeHeaderValue,
  normalizeAddress,
  tailscaleIdentity,
  type TailscaleTrust,
} from '../src/auth/tailscaleIdentity';
import { FakeClock } from './support/fakes';

const HOUR = 60 * 60 * 1000;

describe('SessionSigner', () => {
  const signer = new SessionSigner('secret', '1234');
  const token = signer.issue(1000, HOUR);

  it.each([
    { label: 'its own token, still fresh', candidate: token, now: 1000 + HOUR - 1, expected: true },
    { label: 'its own token, expired', candidate: token, now: 1000 + HOUR, expected: false },
    { label: 'a token issued in the future', candidate: token, now: 999, expected: false },
    { label: 'undefined', candidate: undefined, now: 1000, expected: false },
    { label: 'garbage', candidate: 'nope', now: 1000, expected: false },
    {
      label: 'a stretched expiry',
      candidate: token.replace(`.${1000 + HOUR}.`, '.9999999999999.'),
      now: 1000,
      expected: false,
    },
    { label: 'a v1 token', candidate: 'v1.1000.abc', now: 1000, expected: false },
    {
      label: 'another passcode',
      candidate: new SessionSigner('secret', '9999').issue(1000, HOUR),
      now: 1000,
      expected: false,
    },
    {
      label: 'another secret',
      candidate: new SessionSigner('other', '1234').issue(1000, HOUR),
      now: 1000,
      expected: false,
    },
  ])('verifies $label → $expected', ({ candidate, now, expected }) => {
    expect(signer.verify(candidate, now)).toBe(expected);
  });

  it('rejects every earlier token after rekey', () => {
    const rotating = new SessionSigner('first', '1234');
    const old = rotating.issue(0, HOUR);
    rotating.rekey('second');
    expect(rotating.verify(old, 1)).toBe(false);
    expect(rotating.verify(rotating.issue(0, HOUR), 1)).toBe(true);
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
    ['café', 'café', true],
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

describe('tailscale identity', () => {
  it.each([
    ['plain ascii', 'Ann Lee', 'Ann Lee'],
    ['RFC 2047 Q-encoded', '=?utf-8?q?Jos=C3=A9_Mar=C3=ADa?=', 'José María'],
    ['lower-case charset marker', '=?UTF-8?Q?=E6=9D=B1?=', '東'],
    ['empty', '', ''],
  ])('decodeHeaderValue: %s', (_, input, expected) => {
    expect(decodeHeaderValue(input)).toBe(expected);
  });

  it.each([
    ['::ffff:127.0.0.1', '127.0.0.1'],
    ['::1', '::1'],
    ['172.30.100.1', '172.30.100.1'],
    [undefined, ''],
  ])('normalizeAddress(%j) → %j', (input, expected) => {
    expect(normalizeAddress(input)).toBe(expected);
  });

  const trust: TailscaleTrust = { proxies: ['127.0.0.1', '172.30.100.1'], users: ['me@example.com'] };
  const headers = { 'tailscale-user-login': 'me@example.com', 'tailscale-user-name': 'Me' };

  it.each([
    {
      label: 'trusted proxy, allowed user',
      h: headers,
      peer: '127.0.0.1',
      t: trust,
      expected: { login: 'me@example.com', name: 'Me' },
    },
    {
      label: 'IPv4-mapped trusted proxy',
      h: headers,
      peer: '::ffff:172.30.100.1',
      t: trust,
      expected: { login: 'me@example.com', name: 'Me' },
    },
    {
      label: 'login matched case-insensitively',
      h: { 'tailscale-user-login': 'ME@Example.com' },
      peer: '127.0.0.1',
      t: trust,
      expected: { login: 'ME@Example.com', name: null },
    },
    { label: 'untrusted peer forging headers', h: headers, peer: '100.64.0.7', t: trust, expected: null },
    {
      label: 'user not on the allowlist',
      h: { 'tailscale-user-login': 'stranger@example.com' },
      peer: '127.0.0.1',
      t: trust,
      expected: null,
    },
    {
      label: 'wildcard allowlist',
      h: { 'tailscale-user-login': 'anyone@github' },
      peer: '127.0.0.1',
      t: { ...trust, users: ['*'] },
      expected: { login: 'anyone@github', name: null },
    },
    {
      label: 'no identity header (tagged device or local request)',
      h: {},
      peer: '127.0.0.1',
      t: trust,
      expected: null,
    },
    {
      label: 'identity sign-in disabled',
      h: headers,
      peer: '127.0.0.1',
      t: { ...trust, users: [] },
      expected: null,
    },
  ])('$label', ({ h, peer, t, expected }) => {
    expect(tailscaleIdentity(h, peer, t)).toEqual(expected);
  });
});

function service(options: { passcode?: string; tailscale?: boolean } = {}) {
  const clock = new FakeClock(0);
  const signer = new SessionSigner('s', options.passcode ?? '');
  const auth = new AuthService({
    passcode: options.passcode,
    tailscaleSignIn: options.tailscale ?? false,
    signer,
    secrets: new MemorySecretStore('s'),
    throttle: new LoginThrottle(clock),
    clock,
  });
  return { auth, clock, signer };
}

describe('AuthService', () => {
  const me = { login: 'me@example.com', name: 'Me' };
  const none: Credentials = { token: undefined, identity: null };

  it.each([
    { label: 'nothing configured', options: {}, creds: none, method: 'open' },
    { label: 'passcode, no session', options: { passcode: '1' }, creds: none, method: null },
    {
      label: 'passcode, tailnet identity but identity sign-in off',
      options: { passcode: '1' },
      creds: { token: undefined, identity: me },
      method: null,
    },
    {
      label: 'identity sign-in, tailnet identity',
      options: { tailscale: true },
      creds: { token: undefined, identity: me },
      method: 'tailscale',
    },
    {
      label: 'identity sign-in only, plain request',
      options: { tailscale: true },
      creds: none,
      method: null,
    },
    {
      label: 'both, tailnet identity',
      options: { passcode: '1', tailscale: true },
      creds: { token: undefined, identity: me },
      method: 'tailscale',
    },
  ])('$label → $method', ({ options, creds, method }) => {
    expect(service(options).auth.method(creds as Credentials)).toBe(method);
  });

  it('reports status for a tailnet user', () => {
    const { auth } = service({ tailscale: true });
    expect(auth.status({ token: undefined, identity: me })).toEqual({
      required: true,
      authenticated: true,
      passcode: false,
      numeric: false,
      method: 'tailscale',
      user: me,
    });
  });

  it.each([
    { remember: true, ttl: REMEMBER_TTL_MS },
    { remember: false, ttl: SESSION_TTL_MS },
  ])('a remember=$remember login lasts $ttl ms', ({ remember, ttl }) => {
    const { auth, clock } = service({ passcode: '2468' });
    const outcome = auth.login('2468', remember);
    if (!outcome.ok) throw new Error('login failed');
    expect(outcome.ttlMs).toBe(ttl);
    clock.advance(ttl - 1);
    expect(auth.method({ token: outcome.token, identity: null })).toBe('session');
    clock.advance(1);
    expect(auth.method({ token: outcome.token, identity: null })).toBeNull();
  });

  it('refuses passcode login when only tailnet identity sign-in is configured', () => {
    expect(service({ tailscale: true }).auth.login('', true)).toEqual({ ok: false, retryAfterSeconds: 0 });
  });

  it('signs out every device', () => {
    const { auth } = service({ passcode: '2468' });
    const outcome = auth.login('2468', true);
    if (!outcome.ok) throw new Error('login failed');
    auth.signOutEverywhere();
    expect(auth.isAuthenticated({ token: outcome.token, identity: null })).toBe(false);
  });

  it('locks out after repeated failures, then recovers', () => {
    const { auth, clock } = service({ passcode: 'secret' });
    for (let i = 0; i < 4; i++)
      expect(auth.login('wrong', false)).toEqual({ ok: false, retryAfterSeconds: 0 });
    expect(auth.login('wrong', false)).toEqual({ ok: false, retryAfterSeconds: 30 });
    expect(auth.login('secret', false)).toEqual({ ok: false, retryAfterSeconds: 30 });
    clock.advance(30_000);
    expect(auth.login('secret', false).ok).toBe(true);
  });
});
