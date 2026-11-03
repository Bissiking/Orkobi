import { generateKeyPairSync } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { publicKeyId } from '../lib/store/dist/index.js';
try {
  if (process.argv.length !== 3) throw new Error();
  const directory = resolve(process.argv[2]);
  await mkdir(dirname(directory), { recursive: true });
  await mkdir(directory, { mode: 0o700 });
  const keys = generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  await writeFile(resolve(directory, 'signing-private.pem'), keys.privateKey, {
    flag: 'wx',
    mode: 0o600,
  });
  await writeFile(resolve(directory, 'public-key.pem'), keys.publicKey, {
    flag: 'wx',
    mode: 0o644,
  });
  process.stdout.write(
    `${JSON.stringify({ event: 'store_key_created', keyId: publicKeyId(keys.publicKey) })}\n`,
  );
} catch {
  process.stderr.write('Création refusée : fournir un nouveau répertoire de clés.\n');
  process.exitCode = 1;
}
