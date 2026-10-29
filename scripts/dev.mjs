import { spawn } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
const { setTimeout, clearTimeout } = globalThis;
let deadline;
function terminate(child, signal) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) terminate(child, 'SIGTERM');
  deadline = setTimeout(() => {
    for (const child of children) {
      terminate(child, 'SIGKILL');
    }
  }, 7000);
  deadline.unref();
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => stop());
for (const [command, args] of [
  [process.execPath, ['scripts/dev-core.mjs', 'all']],
  ['pnpm', ['--filter', '@orkobi/web', 'dev']],
]) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    detached: process.platform !== 'win32',
  });
  children.push(child);
  child.once('error', () => {
    process.stderr.write('Impossible de lancer un service de développement.\n');
    stop(1);
  });
  child.once('exit', (code) => {
    if (!stopping) stop(code ?? 1);
    if (children.every((other) => other.exitCode !== null || other.signalCode !== null))
      clearTimeout(deadline);
  });
}
