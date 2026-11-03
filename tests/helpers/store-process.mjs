import process from 'node:process';
import { createStoreServer } from '../../apps/store/dist/application.js';
const config = JSON.parse(process.env.STORE_TEST_CONFIG);
const server = createStoreServer(config);
server.listen(0, '127.0.0.1', () => process.send({ port: server.address().port }));
process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
  server.closeAllConnections();
});
