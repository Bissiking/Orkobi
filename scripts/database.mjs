import process from 'node:process';
import {
  loadDatabaseConfig,
  PostgreSqlDatabase,
  DatabaseConfigurationError,
} from '../lib/database/dist/index.js';

const command = process.argv[2];
let database;
try {
  if (command !== 'migrate' && command !== 'status') throw new Error('Commande inconnue.');
  const config = loadDatabaseConfig(process.env, command === 'migrate');
  if (!config) throw new Error('Base désactivée.');
  database = new PostgreSqlDatabase(config);
  if (command === 'migrate') {
    const applied = await database.migrate();
    process.stdout.write(`${JSON.stringify({ event: 'database_migrated', applied })}\n`);
  } else {
    const ready = await database.isReady();
    process.stdout.write(`${JSON.stringify({ event: 'database_status', ready })}\n`);
    if (!ready) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(
    `${JSON.stringify({
      event: 'database_failed',
      reason:
        error instanceof DatabaseConfigurationError
          ? error.message
          : 'Opération SQL impossible ; vérifier la connexion et les migrations.',
    })}\n`,
  );
  process.exitCode = 1;
} finally {
  await database?.close();
}
