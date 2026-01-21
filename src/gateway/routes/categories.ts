import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { listCategories, createCategory } from '../services/categories.js';

export function registerCategoryRoutes(app: FastifyInstance) {
  app.get('/api/v1/categories', async (request, reply) => {
    const categories = await listCategories(request.auth?.organizationId || '');
    reply.send(successResponse(request.requestId || '', categories));
  });

  app.post('/api/v1/categories', async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1),
      type: z.enum(['income', 'expense']),
      parent_id: z.string().uuid().optional(),
      tax_category: z.string().optional(),
      is_tax_deductible: z.boolean().optional(),
      tax_deduction_percent: z.number().optional(),
      color: z.string().optional(),
      icon: z.string().optional(),
      sort_order: z.number().optional()
    });

    const body = bodySchema.parse(request.body);
    const created = await createCategory(request.auth?.organizationId || '', body);
    reply.code(201).send(successResponse(request.requestId || '', created));
  });
}
