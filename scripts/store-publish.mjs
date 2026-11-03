import { createPublicKey, randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import process from 'node:process';
import {
  artifactDigest,
  artifactLimit,
  canonical,
  signCatalog,
  verifyCatalog,
  verifyArtifact,
  repositoryIdPattern,
} from '../lib/store/dist/index.js';
import { isPluginArtifact } from '../lib/contracts/dist/index.js';
try {
  const [directoryArg, id, keyArg, ...args] = process.argv.slice(2);
  if (!directoryArg || !id || !repositoryIdPattern.test(id) || !keyArg) throw new Error();
  const directory = resolve(directoryArg),
    keyPath = resolve(keyArg);
  if (!relative(directory, keyPath).startsWith('..')) throw new Error();
  const privateKey = await readFile(keyPath, 'utf8'),
    publicKey = createPublicKey(privateKey).export({ format: 'pem', type: 'spki' });
  let previous;
  try {
    previous = JSON.parse(await readFile(resolve(directory, 'catalog.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (previous)
    previous = verifyCatalog(
      previous,
      id,
      [publicKey],
      Math.min(Date.now(), Date.parse(previous.catalog.expiresAt) - 1),
    );
  const releases = [...(previous?.catalog.releases ?? [])];
  let versions = {};
  try {
    const bytes = await readFile(resolve(directory, 'versions.json'));
    if (bytes.length > 2097152) throw new Error();
    versions = JSON.parse(bytes.toString('utf8'));
    if (
      !versions ||
      Array.isArray(versions) ||
      typeof versions !== 'object' ||
      Object.keys(versions).length > 10000
    )
      throw new Error();
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  for (const release of releases) {
    const identity = `${release.manifest.module.id}@${release.manifest.module.version}`;
    const old = versions[identity];
    if (
      old &&
      (old.digest !== release.digest || canonical(old.sqlEngines) !== canonical(release.sqlEngines))
    )
      throw new Error();
    versions[identity] = { digest: release.digest, sqlEngines: release.sqlEngines };
  }

  const enginesArg = args.find((arg) => arg.startsWith('--sql=')),
    engines = (enginesArg?.slice(6) ?? 'postgresql,mariadb,mysql').split(',');
  if (
    !engines.length ||
    engines.some((engine) => !['postgresql', 'mariadb', 'mysql'].includes(engine)) ||
    new Set(engines).size !== engines.length
  )
    throw new Error();
  for (const arg of args) {
    if (arg === enginesArg || arg === '--refresh') continue;
    if (arg.startsWith('--withdraw=')) {
      const identity = arg.slice(11),
        index = releases.findIndex(
          (r) => `${r.manifest.module.id}@${r.manifest.module.version}` === identity,
        );
      if (index < 0) throw new Error();
      releases.splice(index, 1);
      continue;
    }
    if (arg.startsWith('--')) throw new Error();
    const bytes = await readFile(resolve(arg));
    if (bytes.length > artifactLimit) throw new Error();
    const artifact = JSON.parse(bytes.toString('utf8'));
    if (!isPluginArtifact(artifact)) throw new Error();
    const release = {
      manifest: artifact.manifest,
      digest: artifactDigest(artifact),
      sqlEngines: engines,
      publishedAt: new Date().toISOString(),
    };
    const identity = `${release.manifest.module.id}@${release.manifest.module.version}`,
      known = versions[identity];
    if (
      known &&
      (known.digest !== release.digest || canonical(known.sqlEngines) !== canonical(engines))
    )
      throw new Error();
    versions[identity] = { digest: release.digest, sqlEngines: engines };
    const old = releases.find(
      (r) =>
        r.manifest.module.id === release.manifest.module.id &&
        r.manifest.module.version === release.manifest.module.version,
    );
    if (old) {
      if (old.digest !== release.digest || canonical(old.sqlEngines) !== canonical(engines))
        throw new Error();
      continue;
    }
    await mkdir(resolve(directory, 'artifacts'), { recursive: true });
    const output = resolve(directory, 'artifacts', `${release.digest}.json`);
    try {
      await writeFile(output, JSON.stringify(artifact), { flag: 'wx', mode: 0o644 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      verifyArtifact(JSON.parse(await readFile(output, 'utf8')), release);
    }
    releases.push(release);
  }
  const now = Date.now(),
    catalog = {
      apiVersion: 1,
      repositoryId: id,
      sequence: (previous?.catalog.sequence ?? 0) + 1,
      issuedAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 86400000).toISOString(),
      releases,
    };
  const signed = signCatalog(catalog, privateKey);
  if (Object.keys(versions).length > 10000) throw new Error();
  await mkdir(directory, { recursive: true });
  const temporary = resolve(directory, `.catalog-${randomBytes(6).toString('hex')}.json`);
  await writeFile(temporary, JSON.stringify(signed), { flag: 'wx', mode: 0o644 });
  await writeFile(resolve(directory, 'public-key.pem'), publicKey, { mode: 0o644 });
  const ledger = resolve(directory, `.versions-${randomBytes(6).toString('hex')}.json`);
  await writeFile(ledger, JSON.stringify(versions), { flag: 'wx', mode: 0o644 });
  await rename(ledger, resolve(directory, 'versions.json'));
  await rename(temporary, resolve(directory, 'catalog.json'));
  process.stdout.write(
    `${JSON.stringify({ event: 'store_catalog_written', repositoryId: id, sequence: catalog.sequence, releases: releases.length, keyId: signed.keyId })}\n`,
  );
} catch {
  process.stderr.write(
    'Publication locale refusée : vérifier les clés, les paquets et les versions immuables.\n',
  );
  process.exitCode = 1;
}
