import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import {
  listExpenses,
  createExpense,
  getExpense,
  updateExpense,
  deleteExpense,
  restoreExpense,
  splitExpense,
  bulkUpdateExpenses,
  exportExpenses,
  listBillableExpenses
} from '../services/expenses.js';

export function registerExpenseRoutes(app: FastifyInstance) {
  app.get('/api/v1/expenses', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      category_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional(),
      status: z.string().optional(),
      is_billable: z.coerce.boolean().optional(),
      is_billed: z.coerce.boolean().optional(),
      client_id: z.string().uuid().optional(),
      has_receipt: z.coerce.boolean().optional(),
      is_from_bank: z.coerce.boolean().optional(),
      min_amount: z.coerce.number().optional(),
      max_amount: z.coerce.number().optional(),
      search: z.string().optional(),
      tags: z.string().optional(),
      sort: z.string().optional(),
      include_deleted: z.coerce.boolean().optional().default(false)
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listExpenses(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      date_from: query.date_from,
      date_to: query.date_to,
      category_id: query.category_id,
      vendor_id: query.vendor_id,
      status: query.status,
      is_billable: query.is_billable,
      is_billed: query.is_billed,
      client_id: query.client_id,
      has_receipt: query.has_receipt,
      is_from_bank: query.is_from_bank,
      min_amount: query.min_amount,
      max_amount: query.max_amount,
      search: query.search,
      tags: query.tags ? query.tags.split(',').map((tag) => tag.trim()).filter(Boolean) : undefined,
      sort: query.sort,
      include_deleted: query.include_deleted
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage),
        summary: result.summary
      })
    );
  });

  app.post('/api/v1/expenses', async (request, reply) => {
    const bodySchema = z.object({
      description: z.string().min(1).max(500),
      amount_cents: z.number().int().min(1).max(100000000),
      currency: z.string().length(3).optional(),
      date: z.string(),
      category_id: z.string().uuid(),
      vendor_id: z.string().uuid().optional(),
      vendor_name: z.string().optional(),
      payment_method: z.string().optional(),
      is_billable: z.boolean().optional(),
      client_id: z.string().uuid().optional(),
      notes: z.string().max(2000).optional(),
      tags: z.array(z.string().max(50)).max(20).optional(),
      is_tax_deductible: z.boolean().optional(),
      receipt_id: z.string().uuid().optional()
    });

    const body = bodySchema.parse(request.body);
    const expense = await createExpense(request.auth.organizationId, request.auth.userId, body);

    reply.code(201).send(successResponse(request.auth.requestId, expense));
  });

  app.get('/api/v1/expenses/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({ include: z.string().optional() });

    const params = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);
    const include = new Set((query.include ?? '').split(',').map((value) => value.trim()).filter(Boolean));

    const expense = await getExpense(request.auth.organizationId, params.id, {
      includeAttachments: include.has('attachments'),
      includeReceipt: include.has('receipt'),
      includeSplits: include.has('splits'),
      includeBankTransaction: include.has('bank_transaction')
    });

    reply.send(successResponse(request.auth.requestId, expense));
  });

  app.put('/api/v1/expenses/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      description: z.string().min(1).max(500).optional(),
      amount_cents: z.number().int().min(1).max(100000000).optional(),
      currency: z.string().length(3).optional(),
      date: z.string().optional(),
      category_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional(),
      payment_method: z.string().optional(),
      is_billable: z.boolean().optional(),
      client_id: z.string().uuid().optional(),
      notes: z.string().max(2000).optional(),
      tags: z.array(z.string().max(50)).max(20).optional(),
      is_tax_deductible: z.boolean().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const expense = await updateExpense(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, expense));
  });

  app.delete('/api/v1/expenses/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({ permanent: z.coerce.boolean().optional().default(false) });

    const params = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    const result = await deleteExpense(request.auth.organizationId, params.id, { permanent: query.permanent });
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/expenses/:id/restore', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const expense = await restoreExpense(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, expense));
  });

  app.post('/api/v1/expenses/:id/split', async (request, reply) => {
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

    const result = await splitExpense(request.auth.organizationId, params.id, body.splits);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/expenses/bulk-update', async (request, reply) => {
    const bodySchema = z.object({
      expense_ids: z.array(z.string().uuid()),
      updates: z.object({
        category_id: z.string().uuid().optional(),
        is_billable: z.boolean().optional(),
        tags: z.array(z.string().max(50)).optional(),
        add_tags: z.array(z.string().max(50)).optional(),
        remove_tags: z.array(z.string().max(50)).optional()
      })
    });

    const body = bodySchema.parse(request.body);
    const result = await bulkUpdateExpenses(request.auth.organizationId, body.expense_ids, body.updates);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.get('/api/v1/expenses/export', async (request, reply) => {
    const querySchema = z.object({
      date_from: z.string(),
      date_to: z.string(),
      format: z.string().optional().default('csv'),
      include_receipts: z.coerce.boolean().optional().default(false)
    });

    const query = querySchema.parse(request.query);
    const csv = await exportExpenses(request.auth.organizationId, {
      date_from: query.date_from,
      date_to: query.date_to,
      include_receipts: query.include_receipts
    });

    reply.header('Content-Type', 'text/csv');
    reply.header('Content-Disposition', `attachment; filename="expenses_${query.date_from}_${query.date_to}.csv"`);
    reply.send(csv);
  });

  app.get('/api/v1/expenses/billable', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      client_id: z.string().uuid().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional()
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listBillableExpenses(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      client_id: query.client_id,
      date_from: query.date_from,
      date_to: query.date_to
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage),
        summary: result.summary
      })
    );
  });
}
