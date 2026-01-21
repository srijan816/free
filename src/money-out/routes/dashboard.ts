import { FastifyInstance } from 'fastify';
import { successResponse } from '../utils/api-response.js';
import { getDashboardData } from '../services/dashboard.js';

export function registerDashboardRoutes(app: FastifyInstance) {
  app.get('/api/v1/internal/dashboard-data', async (request, reply) => {
    const data = await getDashboardData(request.auth.organizationId);
    reply.send(successResponse(request.auth.requestId, data));
  });
}
