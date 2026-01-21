import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import {
  listRecurringExpenses,
  createRecurringExpense,
  updateRecurringExpense,
  pauseRecurringExpense,
  resumeRecurringExpense,
  cancelRecurringExpense,
  listUpcomingRecurring
} from '../services/recurring-expenses.js';

export function registerRecurringExpenseRoutes(app: FastifyInstance) {
  app.get('/api/v1/recurring-expenses', async (request, reply) => {
    const querySchema = z.object({
      status: z.string().optional(),
      category_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional()
    });

    const query = querySchema.parse(request.query);
    const result = await listRecurringExpenses(request.auth.organizationId, query);
    reply.send(successResponse(request.auth.requestId, result.data, { summary: result.summary }));
  });

  app.post('/api/v1/recurring-expenses', async (request, reply) => {
    const bodySchema = z.object({
      description: z.string().min(1).max(500),
      amount_cents: z.number().int().min(1),
      currency: z.string().length(3).optional(),
      category_id: z.string().uuid(),
      vendor_id: z.string().uuid().optional(),
      frequency: z.string(),
      frequency_interval: z.number().int().optional(),
      custom_days: z.number().int().optional(),
      start_date: z.string(),
      end_date: z.string().optional().nullable(),
      billing_day: z.number().int().optional(),
      payment_method: z.string().optional(),
      notify_before_days: z.number().int().optional(),
      notes: z.string().optional()
    });

    const body = bodySchema.parse(request.body);
    const recurring = await createRecurringExpense(request.auth.organizationId, request.auth.userId, body);
    reply.code(201).send(successResponse(request.auth.requestId, recurring));
  });

  app.put('/api/v1/recurring-expenses/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      description: z.string().optional(),
      amount_cents: z.number().int().optional(),
      currency: z.string().length(3).optional(),
      category_id: z.string().uuid().optional(),
      vendor_id: z.string().uuid().optional(),
      payment_method: z.string().optional(),
      frequency: z.string().optional(),
      frequency_interval: z.number().int().optional(),
      custom_days: z.number().int().optional(),
      end_date: z.string().optional(),
      billing_day: z.number().int().optional(),
      billing_weekday: z.number().int().optional(),
      notify_before_days: z.number().int().optional(),
      notes: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const recurring = await updateRecurringExpense(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, recurring));
  });

  app.post('/api/v1/recurring-expenses/:id/pause', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const recurring = await pauseRecurringExpense(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, recurring));
  });

  app.post('/api/v1/recurring-expenses/:id/resume', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ next_occurrence_date: z.string().optional() });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const recurring = await resumeRecurringExpense(request.auth.organizationId, params.id, body.next_occurrence_date);
    reply.send(successResponse(request.auth.requestId, recurring));
  });

  app.post('/api/v1/recurring-expenses/:id/cancel', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const recurring = await cancelRecurringExpense(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, recurring));
  });

  app.get('/api/v1/recurring-expenses/upcoming', async (request, reply) => {
    const querySchema = z.object({ days: z.coerce.number().optional().default(30) });
    const query = querySchema.parse(request.query);

    const result = await listUpcomingRecurring(request.auth.organizationId, query.days);
    reply.send(successResponse(request.auth.requestId, result.data, { summary: result.summary }));
  });
}
