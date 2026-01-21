import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getUnifiedDashboard, getQuickSummary, getRecentActivity } from '../services/unified.js';

export function registerUnifiedRoutes(app: FastifyInstance) {
  app.get('/api/v1/unified/dashboard', async (request, reply) => {
    const querySchema = z.object({
      period: z.string().optional(),
      start_date: z.string().optional(),
      end_date: z.string().optional()
    });
    const query = querySchema.parse(request.query);

    const headers = buildForwardHeaders(request.headers, request.auth);
    const result = await getUnifiedDashboard(request.auth?.organizationId || '', query, headers);
    reply.send(successResponse(request.requestId || '', result));
  });

  app.get('/api/v1/unified/summary', async (request, reply) => {
    const headers = buildForwardHeaders(request.headers, request.auth);
    const result = await getQuickSummary(request.auth?.organizationId || '', headers);
    reply.send(successResponse(request.requestId || '', result));
  });

  app.get('/api/v1/unified/activity', async (request, reply) => {
    const headers = buildForwardHeaders(request.headers, request.auth);
    const result = await getRecentActivity(headers);
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
