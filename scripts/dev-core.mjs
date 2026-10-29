import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { once } from 'node:events';
import { fileURLToPath, URL } from 'node:url';
import process from 'node:process';

const { setTimeout, clearTimeout } = globalThis;
const root = fileURLToPath(new URL('../', import.meta.url));
const sources = [
  'apps/core/src',
  'lib/contracts/src',
  'lib/database/src',
  'lib/events/src',
  'lib/identity/src',
  'lib/security/src',
  'sdk/core/src',
  'sdk/types/src',
];
let child;
let stopping = false;
let rebuilding = false;
let pending = false;
let timer;

function launch(command, args) {
  return spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
}

function terminate(target, signal) {
  if (!target?.pid || target.exitCode !== null || target.signalCode !== null) return;
  try {
    if (process.platform === 'win32') target.kill(signal);
    else process.kill(-target.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}

async function stopChild() {
  const target = child;
  if (!target || target.exitCode !== null || target.signalCode !== null) return;
  const closed = once(target, 'close');
  terminate(target, 'SIGTERM');
  const deadline = setTimeout(() => terminate(target, 'SIGKILL'), 5000);
  try {
    await closed;
  } finally {
    clearTimeout(deadline);
  }
}

async function rebuild() {
  if (stopping) return;
  if (rebuilding) {
    pending = true;
    return;
  }
  rebuilding = true;
  try {
    await stopChild();
    if (stopping) return;
    // tsc produit les métadonnées des décorateurs et compile les liens workspace.
    child = launch('pnpm', ['build']);
    const [code] = await once(child, 'close');
    if (!stopping && code === 0 && !pending) {
      child = launch(process.execPath, ['--env-file-if-exists=.env', 'apps/core/dist/main.js']);
      child.on('error', () => {
        process.stderr.write('Impossible de lancer le Core.\n');
      });
    }
  } catch {
    process.stderr.write('Échec du développement Core ; en attente d’une modification.\n');
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
// Le dossier racine est surveillé sans récursion, y compris si .env n'existe pas encore.
watchers.push(
  watch(root, (_event, filename) => {
    if (filename === '.env') schedule();
  }),
);

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    stopping = true;
    clearTimeout(timer);
    for (const watcher of watchers) watcher.close();
    void stopChild();
  });
}

await rebuild();
