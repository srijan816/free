import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { searchAll } from '../services/search.js';

export function registerSearchRoutes(app: FastifyInstance) {
  app.get('/api/v1/search', async (request, reply) => {
    const querySchema = z.object({
      q: z.string(),
      type: z.string().optional(),
      limit: z.coerce.number().optional()
    });

    const query = querySchema.parse(request.query);
    const headers = buildForwardHeaders(request.headers, request.auth);
    const result = await searchAll(query.q, { type: query.type, limit: query.limit }, headers);
    reply.send(successResponse(request.requestId || '', result));
  });
}

function buildForwardHeaders(headers: Record<string, any>, auth: any) {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!value) continue;
    result[key.toLowerCase()] = Array.isArray(value) ? value.join(',') : String(value);
  }
  if (auth) {
    result['x-organization-id'] = auth.organizationId;
    result['x-user-id'] = auth.userId;
    result['x-user-role'] = auth.userRole;
    result['x-user-permissions'] = auth.permissions?.join(',') || '';
    result['x-request-id'] = auth.requestId;
  }
  return result;
}
