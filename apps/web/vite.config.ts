import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('../../', import.meta.url));
const manifest = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
) as { version: string };
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, root, '');
  const port = Number(process.env.WEB_PORT ?? env.WEB_PORT ?? '5173');
  const bffPort = process.env.BFF_PORT ?? env.BFF_PORT ?? '3000';
  if (
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535 ||
    !/^\d+$/u.test(bffPort) ||
    Number(bffPort) < 1 ||
    Number(bffPort) > 65535
  ) {
    throw new Error('WEB_PORT et BFF_PORT doivent être des ports valides.');
  }
  return {
    plugins: [react()],
    envDir: root,
    define: { __APP_VERSION__: JSON.stringify(manifest.version) },
    resolve: { dedupe: ['react', 'react-dom'] },
    server: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${bffPort}` } },
    },
    preview: {
      host: '127.0.0.1',
      port,
      strictPort: true,
      proxy: { '/api': { target: `http://127.0.0.1:${bffPort}` } },
    },
  };
});
