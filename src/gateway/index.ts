import { buildServer } from './server.js';
import { config } from './config.js';

const app = await buildServer();

app.listen({ port: config.port, host: '0.0.0.0' }).then(() => {
  app.log.info(`Integration API listening on ${config.port}`);
});
