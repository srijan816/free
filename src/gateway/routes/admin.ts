import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { config } from '../config.js';
import { listOrganizations, listUsers, listFeatureFlags, updateFeatureFlag, getAuditLogs } from '../services/admin.js';
import { createGodModeExport } from '../services/god-mode-export.js';

export function registerAdminRoutes(app: FastifyInstance) {
  app.get('/api/v1/admin/organizations', async (request, reply) => {
    assertAdmin(request);
    const querySchema = z.object({
      search: z.string().optional(),
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional()
    });
    const query = querySchema.parse(request.query);
    const result = await listOrganizations(query);
    reply.send(successResponse(request.requestId || '', result));
  });

  app.get('/api/v1/admin/users', async (request, reply) => {
    assertAdmin(request);
    const querySchema = z.object({
      organization_id: z.string().uuid().optional(),
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional()
    });
    const query = querySchema.parse(request.query);
    const result = await listUsers(query);
    reply.send(successResponse(request.requestId || '', result));
  });

  app.get('/api/v1/admin/feature-flags', async (request, reply) => {
    assertAdmin(request);
    const result = await listFeatureFlags();
    reply.send(successResponse(request.requestId || '', result));
  });

  app.put('/api/v1/admin/feature-flags/:name', async (request, reply) => {
    assertAdmin(request);
    const paramsSchema = z.object({ name: z.string() });
    const bodySchema = z.object({
      description: z.string().optional(),
      enabled_globally: z.boolean().optional(),
      enabled_for_plans: z.array(z.string()).optional(),
      enabled_for_organizations: z.array(z.string().uuid()).optional(),
      rollout_percentage: z.number().min(0).max(100).optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);
    const result = await updateFeatureFlag(params.name, body);
    reply.send(successResponse(request.requestId || '', result));
  });

  app.get('/api/v1/admin/audit-logs', async (request, reply) => {
    assertAdmin(request);
    const querySchema = z.object({
      organization_id: z.string().uuid().optional(),
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional()
    });

    const query = querySchema.parse(request.query);
    const result = await getAuditLogs(query);
    reply.send(successResponse(request.requestId || '', result));
  });

  app.post('/api/v1/admin/god-mode-export', async (request, reply) => {
    assertAdmin(request);
    const bodySchema = z.object({
      organization_id: z.string().uuid(),
      passphrase: z.string().min(8),
      include_receipts: z.boolean().optional().default(false)
    });

    const body = bodySchema.parse(request.body);
    const result = await createGodModeExport({
      organizationId: body.organization_id,
      passphrase: body.passphrase,
      includeReceipts: body.include_receipts
    });

    reply.send(successResponse(request.requestId || '', result));
  });
}

function assertAdmin(request: any) {
  const auth = request.auth;
  if (!auth) {
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Unauthorized',
      statusCode: 401
    });
  }

  if (auth.permissions?.includes('admin:access')) {
    return;
  }

  if (config.adminEmails.includes(auth.email)) {
    return;
  }

  throw new ApiError({
    code: ERROR_CODES.FORBIDDEN,
    message: 'Admin access required',
    statusCode: 403
  });
}
