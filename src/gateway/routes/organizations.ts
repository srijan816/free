import { FastifyInstance } from 'fastify';
import { successResponse } from '../utils/api-response.js';
import { findOrganizationById, updateOrganization } from '../services/organizations.js';
import { z } from 'zod';

export function registerOrganizationRoutes(app: FastifyInstance) {
  app.get('/api/v1/organizations/me', async (request, reply) => {
    const organization = await findOrganizationById(request.auth?.organizationId || '');
    reply.send(successResponse(request.requestId || '', organization));
  });

  app.put('/api/v1/organizations/me', async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(2).max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      website: z.string().optional(),
      currency: z.string().optional(),
      timezone: z.string().optional()
    });

    const body = bodySchema.parse(request.body);
    const updated = await updateOrganization(request.auth?.organizationId || '', body);
    reply.send(successResponse(request.requestId || '', updated));
  });
}
