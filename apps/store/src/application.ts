import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  verifyCatalog,
  verifyArtifact,
  catalogLimit,
  artifactLimit,
  digestPattern,
} from '@orkobi/store';
export interface StoreServerConfig {
  readonly directory: string;
  readonly publicKeys: readonly string[];
  readonly repositoryId: string;
  readonly token?: string;
}
async function readJson(path: string, limit: number) {
  if ((await stat(path)).size > limit) throw new Error();
  const bytes = await readFile(path);
  if (bytes.length > limit) throw new Error();
  return JSON.parse(bytes.toString('utf8')) as unknown;
}
export function createStoreServer(config: StoreServerConfig) {
  if (config.token && !/^[-A-Za-z0-9_]{32,256}$/u.test(config.token))
    throw new Error('Configuration Store invalide.');
  const catalog = async () =>
    verifyCatalog(
      await readJson(resolve(config.directory, 'catalog.json'), catalogLimit + 1024),
      config.repositoryId,
      config.publicKeys,
    );
  const server = createServer(async (request, response) => {
    response.setHeader('content-type', 'application/json');
    response.setHeader('cache-control', 'no-store');
    response.setHeader('x-content-type-options', 'nosniff');
    const send = (status: number, value: unknown) => {
      response.writeHead(status);
      response.end(JSON.stringify(value));
    };
    try {
      if (request.method !== 'GET') {
        send(405, { error: 'method_not_allowed' });
        return;
      }
      if (request.url === '/health') {
        send(200, { status: 'ok', service: 'orkobi-store' });
        return;
      }
      if (request.url === '/ready') {
        await catalog();
        send(200, { status: 'ok', service: 'orkobi-store' });
        return;
      }
      if (config.token) {
        const actual = Buffer.from(request.headers.authorization ?? ''),
          expected = Buffer.from(`Bearer ${config.token}`);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
          send(401, { error: 'unauthorized' });
          return;
        }
      }
      const snapshot = await catalog();
      if (request.url === '/v1/catalog') {
        send(200, snapshot);
        return;
      }
      const match = /^\/v1\/artifacts\/([a-f0-9]{64})$/u.exec(request.url ?? '');
      if (!match || !digestPattern.test(match[1]!)) {
        send(404, { error: 'not_found' });
        return;
      }
      const release = snapshot.catalog.releases.find((release) => release.digest === match[1]);
      if (!release) {
        send(404, { error: 'not_found' });
        return;
      }
      send(
        200,
        verifyArtifact(
          await readJson(resolve(config.directory, 'artifacts', `${match[1]}.json`), artifactLimit),
          release,
        ),
      );
    } catch {
      send(503, { error: 'store_unavailable' });
    }
  });
  server.requestTimeout = 5000;
  server.headersTimeout = 5000;
  server.maxHeadersCount = 32;
  return server;
}
