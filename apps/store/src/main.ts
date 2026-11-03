import process from 'node:process';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createStoreServer } from './application.js';
import { publicKeyId, repositoryIdPattern } from '@orkobi/store';
try {
  const directory = resolve(process.env.STORE_DIRECTORY ?? 'registry'),
    repositoryId = process.env.STORE_REPOSITORY_ID ?? '',
    port = Number(process.env.STORE_PORT ?? 3002),
    host = process.env.STORE_HOST ?? '127.0.0.1';
  if (
    !repositoryIdPattern.test(repositoryId) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !host ||
    /[\s/]/u.test(host)
  )
    throw new Error();
  const key = await readFile(resolve(directory, 'public-key.pem'), 'utf8');
  publicKeyId(key);
  const server = createStoreServer({
    directory,
    repositoryId,
    publicKeys: [key],
    ...(process.env.STORE_BEARER_TOKEN ? { token: process.env.STORE_BEARER_TOKEN } : {}),
  });
  server.once('error', () => {
    process.stderr.write('{"event":"store_start_failed"}\n');
    process.exitCode = 1;
  });
  server.listen(port, host, () => process.stdout.write('{"event":"store_listening"}\n'));
  for (const signal of ['SIGINT', 'SIGTERM'] as const)
    process.once(signal, () => {
      server.close();
      server.closeIdleConnections();
    });
} catch {
  process.stderr.write('{"event":"store_start_failed"}\n');
  process.exitCode = 1;
}
