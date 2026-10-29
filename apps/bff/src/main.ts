import { createBffApplication } from './application.js';
import { BffConfigurationError, loadBffConfig } from './config.js';
import { JsonLogger } from './logger.js';

const logger = new JsonLogger();
try {
  const config = loadBffConfig();
  const app = await createBffApplication(config, logger);
  app.enableShutdownHooks(['SIGINT', 'SIGTERM']);
  await app.listen(config.port, config.host);
  logger.event('info', 'bff_listening', { host: config.host, port: config.port });
} catch (error) {
  logger.event('error', 'bff_start_failed', {
    reason: error instanceof BffConfigurationError ? error.message : 'Démarrage impossible.',
  });
  process.exitCode = 1;
}
