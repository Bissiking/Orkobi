import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const { setTimeout, clearTimeout } = globalThis;
const root = fileURLToPath(new URL('../', import.meta.url));
const selection = process.argv[2] ?? 'core';
if (!['core', 'bff', 'all'].includes(selection))
  throw new Error('Service de développement inconnu.');
const services = selection === 'all' ? ['core', 'bff'] : [selection];
const sources = [
  ...services.map((service) => `apps/${service}/src`),
  'lib/contracts/src',
  'lib/database/src',
  'lib/events/src',
  'lib/identity/src',
  'lib/security/src',
  'sdk/core/src',
  'sdk/types/src',
];
const children = new Set();
let stopping = false;
let rebuilding = false;
let pending = false;
let timer;
function launch(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
  children.add(child);
  child.once('close', () => children.delete(child));
  return child;
}
function terminate(child, signal) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
async function stopChildren() {
  await Promise.all(
    [...children].map(async (child) => {
      if (child.exitCode !== null || child.signalCode !== null) return;
      const closed = once(child, 'close');
      terminate(child, 'SIGTERM');
      const deadline = setTimeout(() => terminate(child, 'SIGKILL'), 5000);
      try {
        await closed;
      } finally {
        clearTimeout(deadline);
      }
    }),
  );
}
async function rebuild() {
  if (stopping) return;
  if (rebuilding) {
    pending = true;
    return;
  }
  rebuilding = true;
  try {
    await stopChildren();
    if (stopping) return;
    // Une seule compilation des dépendances communes, même quand Core et BFF changent ensemble.
    const filters = services.flatMap((service) => ['--filter', `@orkobi/${service}...`]);
    const build = launch('pnpm', [...filters, 'build']);
    const [code] = await once(build, 'close');
    if (!stopping && code === 0 && !pending)
      for (const service of services) {
        const server = launch(process.execPath, [
          '--env-file-if-exists=.env',
          `apps/${service}/dist/main.js`,
        ]);
        server.on('error', () =>
          process.stderr.write('Impossible de lancer un serveur de développement.\n'),
        );
      }
  } catch {
    process.stderr.write('Échec du développement ; en attente d’une modification.\n');
  } finally {
    rebuilding = false;
    if (pending && !stopping) {
      pending = false;
      void rebuild();
    }
  }
}
function schedule() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    void rebuild();
  }, 200);
}
const watchers = sources.map((directory) =>
  watch(new URL(`../${directory}/`, import.meta.url), { recursive: true }, (_event, filename) => {
    if (filename?.endsWith('.ts')) schedule();
  }),
);
watchers.push(
  watch(root, (_event, filename) => {
    if (filename === '.env') schedule();
  }),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopping = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    void stopChildren();
  });
await rebuild();
