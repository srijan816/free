import { FastifyInstance } from 'fastify';
import { successResponse } from '../utils/api-response.js';
import { HealthService } from '../services/health.js';

export function registerHealthRoutes(app: FastifyInstance, healthService: HealthService) {
  app.get('/health', async (request, reply) => {
    const result = await healthService.check();
    reply.send(result);
  });

  app.get('/health/ready', async (request, reply) => {
    const health = await healthService.check();
    reply.send({ ready: health.status !== 'unhealthy' });
  });

  app.get('/health/live', async (_request, reply) => {
    reply.send({ alive: true });
  });

  app.get('/health/services', async (request, reply) => {
    const result = await healthService.checkAllServices();
    reply.send(result);
  });

  app.get('/api/v1/health', async (request, reply) => {
    const result = await healthService.check();
    reply.send(successResponse(request.requestId || '', result));
  });
}
