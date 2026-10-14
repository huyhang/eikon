import { describe, expect, it } from 'vitest';
import { appUrl, devProcesses, devSettings } from '../src/devProcesses';

describe('devSettings', () => {
  it.each([
    [{}, [], { mode: 'dev', host: '127.0.0.1', passcode: '1234', serverPort: 8787, webPort: 5173 }],
    [
      { DEV_HOST: '0.0.0.0', EIKON_PASSCODE: '' },
      ['--prod'],
      { mode: 'prod', host: '0.0.0.0', passcode: '' },
    ],
    [{ EIKON_PORT: '9090', WEB_PORT: '3000' }, [], { serverPort: 9090, webPort: 3000 }],
  ])('%j %j', (env, argv, expected) => {
    expect(devSettings(env, '/repo', argv)).toMatchObject(expected);
  });
});

describe('devProcesses', () => {
  it.each([
    ['dev', ['tagger', 'eikon', 'web']],
    ['prod', ['tagger', 'eikon']],
  ] as const)('%s mode runs %j', (mode, names) => {
    const s = devSettings({}, '/repo', mode === 'prod' ? ['--prod'] : []);
    expect(devProcesses(s).map((p) => p.name)).toEqual(names);
  });

  it('points the server at the fake tagger and the dev library', () => {
    const server = devProcesses(devSettings({}, '/repo', [])).find((p) => p.name === 'eikon')!;
    expect(server.env).toMatchObject({
      EIKON_TAGGER_URL: 'http://127.0.0.1:7860',
      EIKON_LIBRARY_DIR: '/repo/.dev/library',
      EIKON_DATA_DIR: '/repo/.dev/data',
      EIKON_PASSCODE: '1234',
    });
    expect(server.env).not.toHaveProperty('EIKON_WEB_DIST');
  });

  it('serves the built web app from the server in prod mode', () => {
    const server = devProcesses(devSettings({}, '/repo', ['--prod'])).find((p) => p.name === 'eikon')!;
    expect(server.env.EIKON_WEB_DIST).toBe('/repo/web/dist');
    expect(server.command).toBe('node');
  });
});

describe('appUrl', () => {
  it.each([
    [[], {}, 'http://127.0.0.1:5173'],
    [['--prod'], {}, 'http://127.0.0.1:8787'],
    [[], { DEV_HOST: '0.0.0.0' }, 'http://localhost:5173'],
  ])('%j %j → %s', (argv, env, expected) => {
    expect(appUrl(devSettings(env, '/repo', argv))).toBe(expected);
  });
});
