import { describe, expect, it } from 'vitest';
import { ConfigError, parseConfig } from '../src/config';

describe('parseConfig', () => {
  it('uses container defaults', () => {
    expect(parseConfig({}, '/app')).toMatchObject({
      host: '0.0.0.0',
      port: 8080,
      libraryDir: '/library',
      dataDir: '/data',
      webDistDir: undefined,
      taggerUrl: 'http://gpubox:7860',
      passcode: undefined,
      cookieSecure: false,
      scanIntervalMs: 300_000,
      tailscaleUsers: [],
      trustedProxies: ['127.0.0.1', '::1'],
    });
  });

  it.each([
    [{ EIKON_PORT: '9000' }, 'port', 9000],
    [{ EIKON_LIBRARY_DIR: 'lib' }, 'libraryDir', '/app/lib'],
    [{ EIKON_WEB_DIST: '../web/dist' }, 'webDistDir', '/web/dist'],
    [{ EIKON_PASSCODE: '  1234 ' }, 'passcode', '1234'],
    [{ EIKON_PASSCODE: '   ' }, 'passcode', undefined],
    [{ EIKON_COOKIE_SECURE: 'TRUE' }, 'cookieSecure', true],
    [{ EIKON_COOKIE_SECURE: 'no' }, 'cookieSecure', false],
    [{ EIKON_SCAN_INTERVAL_MINUTES: '1' }, 'scanIntervalMs', 60_000],
    [{ EIKON_TAGGER_URL: 'http://localhost:7860' }, 'taggerUrl', 'http://localhost:7860'],
    [
      { EIKON_TAILSCALE_USERS: 'me@example.com, you@github ' },
      'tailscaleUsers',
      ['me@example.com', 'you@github'],
    ],
    [{ EIKON_TAILSCALE_USERS: '*' }, 'tailscaleUsers', ['*']],
    [{ EIKON_TRUSTED_PROXIES: '172.30.100.1' }, 'trustedProxies', ['172.30.100.1']],
  ])('%j sets %s', (env, key, expected) => {
    expect(parseConfig(env, '/app')[key as keyof ReturnType<typeof parseConfig>]).toEqual(expected);
  });

  it.each([
    [{ EIKON_PORT: 'eighty' }],
    [{ EIKON_PORT: '0' }],
    [{ EIKON_TAG_CONCURRENCY: '1.5' }],
    [{ EIKON_TAGGER_URL: 'not a url' }],
  ])('rejects %j', (env) => {
    expect(() => parseConfig(env, '/app')).toThrow(ConfigError);
  });
});
