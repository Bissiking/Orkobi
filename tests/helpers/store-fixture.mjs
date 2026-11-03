import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { URL } from 'node:url';
import { generateKeyPairSync } from 'node:crypto';
import { artifactDigest, signCatalog } from '../../lib/store/dist/index.js';
const require = createRequire(new URL('../../package.json', import.meta.url));
const ts = require('typescript');
export async function storeFixture(directory, repositoryId = 'demo') {
  const manifest = JSON.parse(
    (await readFile(new URL('../../examples/plugin-demo/manifest.json', import.meta.url), 'utf8'))
      .replaceAll('community.cards', 'community.storecards')
      .replaceAll('orkobi_ext_community_cards', 'orkobi_ext_community_storecards'),
  );
  const code = ts.transpileModule(
    await readFile(new URL('../../examples/plugin-demo/plugin.ts', import.meta.url), 'utf8'),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText;
  const artifact = { manifest, code };
  const keys = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  await mkdir(`${directory}/artifacts`, { recursive: true });
  const release = (artifact, engines = ['postgresql', 'mariadb', 'mysql']) => ({
    manifest: artifact.manifest,
    digest: artifactDigest(artifact),
    sqlEngines: engines,
    publishedAt: new Date().toISOString(),
  });
  async function publish(artifacts, sequence = 1, options = {}) {
    const releases = artifacts.map((value) =>
      value.artifact ? release(value.artifact, value.engines) : release(value),
    );
    const now = Date.now();
    const catalog = {
      apiVersion: 1,
      repositoryId,
      sequence,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 86400000).toISOString(),
      releases,
      ...options,
    };
    for (const value of artifacts) {
      const current = value.artifact ?? value;
      await writeFile(
        `${directory}/artifacts/${artifactDigest(current)}.json`,
        JSON.stringify(current),
      );
    }
    const signed = signCatalog(catalog, keys.privateKey);
    await writeFile(`${directory}/catalog.json`, JSON.stringify(signed));
    await writeFile(`${directory}/public-key.pem`, keys.publicKey);
    return signed;
  }
  await publish([artifact]);
  return { artifact, keys, publish, repositoryId, release };
}
