import { buildServer } from './server.js';
import { config } from './config.js';
import { registerEventConsumers } from './workers/event-consumers.js';

const app = await buildServer();
registerEventConsumers();

app.listen({ port: config.port, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening at ${address}`);
});
