import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appUrl, devProcesses, devSettings, libraryDir, type ProcessSpec } from './devProcesses';
import { makeSampleLibrary } from './makeSampleLibrary';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const settings = devSettings(process.env, root, process.argv);

function prefixed(name: string, color: number) {
  const label = `\x1b[${color}m${name.padEnd(6)}\x1b[0m │ `;
  let buffered = '';
  return (chunk: Buffer) => {
    buffered += chunk.toString();
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    lines.forEach((line) => process.stdout.write(label + line + '\n'));
  };
}

function start(spec: ProcessSpec): ChildProcess {
  const child = spawn(spec.command, spec.args, {
    cwd: root,
    env: { ...process.env, ...spec.env },
    stdio: 'pipe',
  });
  const write = prefixed(spec.name, spec.color);
  child.stdout?.on('data', write);
  child.stderr?.on('data', write);
  return child;
}

await makeSampleLibrary({ dir: libraryDir(root) });
const children = devProcesses(settings).map((spec) => ({ spec, child: start(spec) }));

let stopping = false;
function stopAll(code: number) {
  if (stopping) return;
  stopping = true;
  children.forEach(({ child }) => child.kill('SIGTERM'));
  setTimeout(() => process.exit(code), 500);
}
children.forEach(({ spec, child }) =>
  child.on('exit', (code) => {
    if (!stopping) console.log(`\n${spec.name} exited (${code}); stopping everything.`);
    stopAll(code ?? 1);
  }),
);
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

console.log(`
  ✦ Eikon dev environment (${settings.mode})
    Open      ${appUrl(settings)}
    Passcode  ${settings.passcode || '(disabled)'}
    Library   ${libraryDir(root)}
    Outage    curl -X POST http://127.0.0.1:${settings.taggerPort}/admin/offline   (…/admin/online to recover)
`);
