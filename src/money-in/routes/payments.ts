import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import { listPayments, getPayment, refundPaymentById } from '../services/payments.js';

export function registerPaymentRoutes(app: FastifyInstance) {
  app.get('/api/v1/payments', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      invoice_id: z.string().uuid().optional(),
      client_id: z.string().uuid().optional(),
      status: z.string().optional(),
      payment_method: z.string().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      sort: z.string().optional()
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listPayments(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      invoice_id: query.invoice_id,
      client_id: query.client_id,
      status: query.status,
      payment_method: query.payment_method,
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

  app.get('/api/v1/payments/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const payment = await getPayment(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, payment));
  });

  app.post('/api/v1/payments/:id/refund', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      amount_cents: z.number().positive().optional(),
      reason: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await refundPaymentById(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.send(successResponse(request.auth.requestId, result));
  });
}
