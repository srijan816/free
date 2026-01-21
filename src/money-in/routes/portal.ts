import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getRequestId } from '../utils/auth.js';
import { createPortalAccess, getPortalByToken } from '../services/portal.js';

export function registerPortalRoutes(app: FastifyInstance) {
  app.post('/api/v1/clients/:id/portal-access', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      access_type: z.string().optional(),
      expires_in_days: z.number().int().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const access = await createPortalAccess(request.auth.organizationId, params.id, body);
    reply.code(201).send(successResponse(request.auth.requestId, access));
  });

  app.get('/api/v1/portal/:token', async (request, reply) => {
    const paramsSchema = z.object({ token: z.string() });
    const params = paramsSchema.parse(request.params);

    const portal = await getPortalByToken(params.token);
    reply.send(successResponse(getRequestId(request.headers as Record<string, unknown>), portal));
  });
}
