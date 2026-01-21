import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import {
  createReceipt,
  listReceipts,
  getReceipt,
  matchReceiptToExpense,
  createExpenseFromReceipt,
  deleteReceipt
} from '../services/receipts.js';

export function registerReceiptRoutes(app: FastifyInstance) {
  app.post('/api/v1/receipts', async (request, reply) => {
    const file = await request.file();
    if (!file) {
      reply.code(400).send({ success: false, error: { code: 'VALIDATION_ERROR', message: 'File is required' } });
      return;
    }

    const fields: Record<string, any> = {};
    for (const [key, value] of Object.entries(file.fields ?? {})) {
      const entry = Array.isArray(value) ? value[0] : value;
      fields[key] = (entry as any)?.value;
    }

    const receipt = await createReceipt(request.auth.organizationId, request.auth.userId, {
      fileName: file.filename,
      mimeType: file.mimetype,
      buffer: await file.toBuffer(),
      source: fields.source,
      expense_id: fields.expense_id
    });

    reply.code(201).send(
      successResponse(request.auth.requestId, receipt, {
        message: 'Receipt uploaded. Processing will complete in a few seconds.',
        processing_webhook: `/api/v1/receipts/${receipt.id}/status`
      })
    );
  });

  app.post('/api/v1/receipts/bulk', async (request, reply) => {
    const files = request.files();
    const uploaded: any[] = [];
    const failed: any[] = [];

    for await (const file of files) {
      try {
        const receipt = await createReceipt(request.auth.organizationId, request.auth.userId, {
          fileName: file.filename,
          mimeType: file.mimetype,
          buffer: await file.toBuffer()
        });
        uploaded.push({ id: receipt.id, file_name: receipt.file_name, status: receipt.status });
      } catch (error: any) {
        failed.push({ file_name: file.filename, error: error?.message ?? 'Upload failed' });
      }
    }

    reply.code(201).send(successResponse(request.auth.requestId, { uploaded, failed }));
  });

  app.get('/api/v1/receipts/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const receipt = await getReceipt(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, receipt));
  });

  app.get('/api/v1/receipts', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      status: z.string().optional(),
      unmatched: z.coerce.boolean().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      sort: z.string().optional()
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listReceipts(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      status: query.status,
      unmatched: query.unmatched,
      date_from: query.date_from,
      date_to: query.date_to,
      sort: query.sort
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage),
        summary: result.summary
      })
    );
  });

  app.post('/api/v1/receipts/:id/match', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ expense_id: z.string().uuid() });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await matchReceiptToExpense(request.auth.organizationId, params.id, body.expense_id);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/receipts/:id/create-expense', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      description: z.string().optional(),
      amount_cents: z.number().int().optional(),
      date: z.string().optional(),
      category_id: z.string().uuid(),
      vendor_id: z.string().uuid().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await createExpenseFromReceipt(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.code(201).send(successResponse(request.auth.requestId, result));
  });

  app.delete('/api/v1/receipts/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const result = await deleteReceipt(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, result));
  });
}
