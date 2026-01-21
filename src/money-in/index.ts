import { buildServer } from './server.js';
import { config } from './config.js';
import { registerEventConsumers } from './workers/event-consumers.js';

const app = await buildServer();
registerEventConsumers();

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  app.log.info(`Money In API listening on ${config.port}`);
});
