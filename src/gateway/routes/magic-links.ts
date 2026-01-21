import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createMagicLink, resolveMagicLink } from '../services/magic-links.js';
import { successResponse } from '../utils/api-response.js';

export function registerMagicLinkRoutes(app: FastifyInstance) {
  app.post('/api/v1/magic-links', async (request, reply) => {
    const bodySchema = z.object({
      organization_id: z.string().uuid().optional(),
      entity_type: z.string(),
      entity_id: z.string(),
      expires_in_days: z.number().int().optional(),
      max_uses: z.number().int().optional(),
      metadata: z.record(z.any()).optional()
    });

    const body = bodySchema.parse(request.body);

    const organizationId = request.auth?.organizationId || body.organization_id;
    if (!organizationId) {
      reply.code(400).send({
        success: false,
        error: { code: 'MISSING_ORGANIZATION', message: 'organization_id is required' }
      });
      return;
    }

    const link = await createMagicLink({
      organization_id: organizationId,
      entity_type: body.entity_type,
      entity_id: body.entity_id,
      created_by_user_id: request.auth?.userId ?? null,
      expires_in_days: body.expires_in_days,
      max_uses: body.max_uses,
      metadata: body.metadata
    });

    reply.code(201).send(successResponse(request.requestId || '', link));
  });

  app.get('/api/v1/magic-links/:token', async (request, reply) => {
    const paramsSchema = z.object({ token: z.string() });
    const params = paramsSchema.parse(request.params);

    const link = await resolveMagicLink(params.token);
    reply.send(successResponse(request.requestId || '', link));
  });
}
