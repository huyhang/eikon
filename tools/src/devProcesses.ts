import path from 'node:path';

export type DevMode = 'dev' | 'prod';

export interface ProcessSpec {
  name: string;
  color: number;
  command: string;
  args: string[];
  env: Record<string, string>;
}

export interface DevSettings {
  root: string;
  mode: DevMode;
  /** Interface to bind (DEV_HOST); 0.0.0.0 makes it reachable from other devices. */
  host: string;
  passcode: string;
  serverPort: number;
  webPort: number;
  taggerPort: number;
}

/** Reads dev settings; EIKON_PASSCODE="" disables the lock screen. */
export function devSettings(
  env: Record<string, string | undefined>,
  root: string,
  argv: string[],
): DevSettings {
  return {
    root,
    mode: argv.includes('--prod') ? 'prod' : 'dev',
    host: env.DEV_HOST || '127.0.0.1',
    passcode: env.EIKON_PASSCODE ?? '1234',
    serverPort: Number(env.EIKON_PORT || 8787),
    webPort: Number(env.WEB_PORT || 5173),
    taggerPort: Number(env.FAKE_TAGGER_PORT || 7860),
  };
}

export function libraryDir(root: string): string {
  return path.join(root, '.dev', 'library');
}

/** The fake GPU tagger, the Eikon server and (in dev mode) the Vite UI server. */
export function devProcesses(s: DevSettings): ProcessSpec[] {
  const tagger: ProcessSpec = {
    name: 'tagger',
    color: 35,
    command: 'npx',
    args: ['tsx', path.join(s.root, 'fake-tagger/src/main.ts')],
    env: { FAKE_TAGGER_PORT: String(s.taggerPort), FAKE_TAGGER_HOST: '127.0.0.1' },
  };
  const serverEnv = {
    EIKON_HOST: s.host,
    EIKON_PORT: String(s.serverPort),
    EIKON_LIBRARY_DIR: libraryDir(s.root),
    EIKON_DATA_DIR: path.join(s.root, '.dev', 'data'),
    EIKON_TAGGER_URL: `http://127.0.0.1:${s.taggerPort}`,
    EIKON_PASSCODE: s.passcode,
    EIKON_SCAN_INTERVAL_MINUTES: '1',
    EIKON_PRETTY_LOGS: '1',
    ...(s.mode === 'prod' ? { EIKON_WEB_DIST: path.join(s.root, 'web/dist') } : {}),
  };
  const server: ProcessSpec =
    s.mode === 'prod'
      ? {
          name: 'eikon',
          color: 36,
          command: 'node',
          args: [path.join(s.root, 'server/dist/main.mjs')],
          env: serverEnv,
        }
      : {
          name: 'eikon',
          color: 36,
          command: 'npx',
          args: ['tsx', 'watch', path.join(s.root, 'server/src/main.ts')],
          env: serverEnv,
        };
  const web: ProcessSpec = {
    name: 'web',
    color: 33,
    command: 'npm',
    args: ['run', 'dev', '-w', 'web', '--', '--port', String(s.webPort), '--strictPort'],
    env: { DEV_HOST: s.host, EIKON_API: `http://127.0.0.1:${s.serverPort}` },
  };
  return s.mode === 'prod' ? [tagger, server] : [tagger, server, web];
}

/** The URL to open in a browser. */
export function appUrl(s: DevSettings): string {
  const host = s.host === '0.0.0.0' ? 'localhost' : s.host;
  return `http://${host}:${s.mode === 'prod' ? s.serverPort : s.webPort}`;
}
