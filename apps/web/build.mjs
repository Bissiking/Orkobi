import { URL } from 'node:url';
import { mkdir, copyFile } from 'node:fs/promises';
import process from 'node:process';

// Le NODE_ENV du .env racine configure les serveurs, pas le runtime du bundle publié.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build();

await mkdir(new URL('./dist/licenses/', import.meta.url), { recursive: true });
await copyFile(
  new URL('../../sdk/ui/PAPICONS_LICENSE.txt', import.meta.url),
  new URL('./dist/licenses/papicons.txt', import.meta.url),
);
