import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import {
  listTransactions,
  getTransaction,
  updateTransaction,
  bulkCategorizeTransactions,
  markTransactionPersonal,
  splitTransaction,
  linkTransactionReceipt
} from '../services/transactions.js';

export function registerTransactionRoutes(app: FastifyInstance) {
  app.get('/api/v1/transactions', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      account_id: z.string().uuid().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      is_categorized: z.coerce.boolean().optional(),
      is_business: z.coerce.boolean().optional(),
      is_pending: z.coerce.boolean().optional(),
      needs_review: z.coerce.boolean().optional(),
      category_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional(),
      min_amount: z.coerce.number().optional(),
      max_amount: z.coerce.number().optional(),
      transaction_type: z.string().optional(),
      search: z.string().optional(),
      sort: z.string().optional()
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listTransactions(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      account_id: query.account_id,
      date_from: query.date_from,
      date_to: query.date_to,
      is_categorized: query.is_categorized,
      is_business: query.is_business,
      is_pending: query.is_pending,
      needs_review: query.needs_review,
      category_id: query.category_id,
      vendor_id: query.vendor_id,
      min_amount: query.min_amount,
      max_amount: query.max_amount,
      transaction_type: query.transaction_type,
      search: query.search,
      sort: query.sort
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage),
        summary: result.summary
      })
    );
  });

  app.get('/api/v1/transactions/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const transaction = await getTransaction(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, transaction));
  });

  app.put('/api/v1/transactions/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      category_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional(),
      is_business: z.boolean().optional(),
      is_excluded: z.boolean().optional(),
      notes: z.string().optional(),
      tags: z.array(z.string().max(50)).optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const transaction = await updateTransaction(request.auth.organizationId, params.id, body, request.auth.userId);
    reply.send(successResponse(request.auth.requestId, transaction));
  });

  app.post('/api/v1/transactions/bulk-categorize', async (request, reply) => {
    const bodySchema = z.object({
      transaction_ids: z.array(z.string().uuid()),
      category_id: z.string().uuid(),
      create_rule: z.boolean().optional().default(false),
      rule_name: z.string().optional()
    });

    const body = bodySchema.parse(request.body);
    const result = await bulkCategorizeTransactions(
      request.auth.organizationId,
      body.transaction_ids,
      body.category_id,
      body.create_rule,
      body.rule_name
    );

    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/transactions/:id/mark-personal', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const result = await markTransactionPersonal(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/transactions/:id/split', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      splits: z.array(
        z.object({
          category_id: z.string().uuid(),
          amount_cents: z.number().int().min(1),
          description: z.string().optional()
        })
      )
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await splitTransaction(request.auth.organizationId, params.id, body.splits);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/transactions/:id/link-receipt', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ receipt_id: z.string().uuid() });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await linkTransactionReceipt(request.auth.organizationId, params.id, body.receipt_id);
    reply.send(successResponse(request.auth.requestId, result));
  });
}
