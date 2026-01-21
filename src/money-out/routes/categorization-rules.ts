import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { listRules, createRule, updateRule, deleteRule, testRule } from '../services/categorization-rules.js';

export function registerRuleRoutes(app: FastifyInstance) {
  app.get('/api/v1/categorization-rules', async (request, reply) => {
    const querySchema = z.object({
      is_active: z.coerce.boolean().optional(),
      category_id: z.string().uuid().optional(),
      sort: z.string().optional()
    });

    const query = querySchema.parse(request.query);
    const rules = await listRules(request.auth.organizationId, query);
    reply.send(successResponse(request.auth.requestId, rules));
  });

  app.post('/api/v1/categorization-rules', async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1),
      conditions: z.array(z.object({
        field: z.string(),
        operator: z.string(),
        value: z.any(),
        case_sensitive: z.boolean().optional()
      })),
      category_id: z.string().uuid(),
      vendor_id: z.string().uuid().optional(),
      tags: z.array(z.string().max(50)).optional(),
      priority: z.number().int().optional()
    });

    const body = bodySchema.parse(request.body);
    const rule = await createRule(request.auth.organizationId, body);
    reply.code(201).send(successResponse(request.auth.requestId, rule));
  });

  app.put('/api/v1/categorization-rules/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      name: z.string().optional(),
      conditions: z.array(z.any()).optional(),
      category_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional(),
      tags: z.array(z.string().max(50)).optional(),
      priority: z.number().int().optional(),
      is_active: z.boolean().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const rule = await updateRule(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, rule));
  });

  app.delete('/api/v1/categorization-rules/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const result = await deleteRule(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/categorization-rules/test', async (request, reply) => {
    const bodySchema = z.object({
      conditions: z.array(z.object({
        field: z.string(),
        operator: z.string(),
        value: z.any(),
        case_sensitive: z.boolean().optional()
      })),
      limit: z.coerce.number().optional().default(20)
    });

    const body = bodySchema.parse(request.body);
    const result = await testRule(request.auth.organizationId, body.conditions as any, body.limit);
    reply.send(successResponse(request.auth.requestId, result));
  });
}
