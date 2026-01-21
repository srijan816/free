import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { updateBankAccount } from '../services/banking.js';
import { listTransactions } from '../services/transactions.js';

export function registerBankAccountRoutes(app: FastifyInstance) {
  app.put('/api/v1/bank-accounts/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      nickname: z.string().optional(),
      is_visible: z.boolean().optional(),
      default_category_id: z.string().uuid().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const account = await updateBankAccount(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, account));
  });

  app.get('/api/v1/bank-accounts/:id/transactions', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      is_categorized: z.coerce.boolean().optional(),
      is_pending: z.coerce.boolean().optional(),
      min_amount: z.coerce.number().optional(),
      max_amount: z.coerce.number().optional(),
      search: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listTransactions(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      account_id: params.id,
      date_from: query.date_from,
      date_to: query.date_to,
      is_categorized: query.is_categorized,
      is_pending: query.is_pending,
      min_amount: query.min_amount,
      max_amount: query.max_amount,
      search: query.search
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage),
        summary: result.summary
      })
    );
  });
}
