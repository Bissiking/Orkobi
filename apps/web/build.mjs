import process from 'node:process';

// Le NODE_ENV du .env racine configure les serveurs, pas le runtime du bundle publié.
process.env.NODE_ENV = 'production';
const { build } = await import('vite');
await build();
