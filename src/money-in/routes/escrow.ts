import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getEscrowDashboard, requestRelease, approveRelease, disputeRelease } from '../services/escrow.js';

export function registerEscrowRoutes(app: FastifyInstance) {
  app.get('/api/v1/escrow', async (request, reply) => {
    const dashboard = await getEscrowDashboard(request.auth.organizationId);
    reply.send(successResponse(request.auth.requestId, dashboard));
  });

  app.post('/api/v1/escrow/transactions/:id/request-release', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      message_to_client: z.string().optional(),
      milestone_id: z.string().uuid().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const updated = await requestRelease(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.post('/api/v1/escrow/transactions/:id/approve-release', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      milestone_id: z.string().uuid().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const updated = await approveRelease(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.post('/api/v1/escrow/transactions/:id/dispute', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      reason: z.string().min(1)
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const dispute = await disputeRelease(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.send(successResponse(request.auth.requestId, dispute));
  });
}
