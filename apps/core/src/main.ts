import 'reflect-metadata';
import { createApplication } from './application.js';
import { ConfigurationError, loadConfig } from './config.js';
import { JsonLogger } from './logger.js';

const logger = new JsonLogger();
try {
  const config = loadConfig();
  const app = await createApplication(config, logger);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  await app.listen(config.port, config.host);
  logger.event('info', 'core_listening', {
    host: config.host,
    port: config.port,
    environment: config.environment,
  });
} catch (error) {
  logger.event('error', 'core_start_failed', {
    reason: error instanceof ConfigurationError ? error.message : 'Démarrage impossible.',
  });
  process.exitCode = 1;
}
