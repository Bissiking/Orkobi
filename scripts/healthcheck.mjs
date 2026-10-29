import process from 'node:process';

const { fetch, AbortSignal } = globalThis;

try {
  const response = await fetch(process.argv[2], {
    signal: AbortSignal.timeout(4500),
    redirect: 'error',
  });
  const result = await response.json();
  if (!response.ok || result.status !== 'ok' || result.service !== process.argv[3])
    process.exitCode = 1;
} catch {
  process.exitCode = 1;
}
