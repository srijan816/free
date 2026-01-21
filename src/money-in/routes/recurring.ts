import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import {
  listRecurringSchedules,
  createRecurringSchedule,
  updateRecurringSchedule,
  pauseRecurringSchedule,
  resumeRecurringSchedule,
  skipRecurringOccurrence
} from '../services/recurring.js';

export function registerRecurringRoutes(app: FastifyInstance) {
  app.get('/api/v1/recurring', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      status: z.string().optional(),
      client_id: z.string().uuid().optional()
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listRecurringSchedules(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      status: query.status,
      client_id: query.client_id
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage)
      })
    );
  });

  app.post('/api/v1/recurring', async (request, reply) => {
    const bodySchema = z.object({
      client_id: z.string().uuid(),
      name: z.string(),
      frequency: z.string(),
      frequency_interval: z.number().int().optional(),
      custom_days: z.number().int().optional(),
      start_date: z.string(),
      end_date: z.string().optional(),
      next_issue_date: z.string().optional(),
      template: z.record(z.any()),
      auto_send: z.boolean().optional(),
      send_days_before_due: z.number().int().optional(),
      status: z.string().optional()
    });

    const body = bodySchema.parse(request.body);
    const schedule = await createRecurringSchedule(request.auth.organizationId, body);

    reply.code(201).send(successResponse(request.auth.requestId, schedule));
  });

  app.put('/api/v1/recurring/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.record(z.any());

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const updated = await updateRecurringSchedule(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.post('/api/v1/recurring/:id/pause', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const updated = await pauseRecurringSchedule(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.post('/api/v1/recurring/:id/resume', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const updated = await resumeRecurringSchedule(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.post('/api/v1/recurring/:id/skip', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      skip_date: z.string(),
      reason: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const skip = await skipRecurringOccurrence(request.auth.organizationId, params.id, body.skip_date, body.reason);
    reply.send(successResponse(request.auth.requestId, skip));
  });
}
