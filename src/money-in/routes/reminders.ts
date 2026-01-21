import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import {
  getReminderSettings,
  updateReminderSettings,
  listReminderTemplates,
  createReminderTemplate,
  updateReminderTemplate,
  deleteReminderTemplate,
  listReminderLogs
} from '../services/reminders.js';

export function registerReminderRoutes(app: FastifyInstance) {
  app.get('/api/v1/reminders/settings', async (request, reply) => {
    const settings = await getReminderSettings(request.auth.organizationId);
    reply.send(successResponse(request.auth.requestId, settings));
  });

  app.put('/api/v1/reminders/settings', async (request, reply) => {
    const bodySchema = z.record(z.any());
    const body = bodySchema.parse(request.body);

    const updated = await updateReminderSettings(request.auth.organizationId, body);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.get('/api/v1/reminders/templates', async (request, reply) => {
    const templates = await listReminderTemplates(request.auth.organizationId);
    reply.send(successResponse(request.auth.requestId, templates));
  });

  app.post('/api/v1/reminders/templates', async (request, reply) => {
    const bodySchema = z.object({
      name: z.string(),
      type: z.string(),
      subject: z.string(),
      body_html: z.string(),
      body_text: z.string(),
      is_default: z.boolean().optional(),
      is_system: z.boolean().optional()
    });

    const body = bodySchema.parse(request.body);
    const created = await createReminderTemplate(request.auth.organizationId, body);
    reply.code(201).send(successResponse(request.auth.requestId, created));
  });

  app.put('/api/v1/reminders/templates/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.record(z.any());

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const updated = await updateReminderTemplate(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.delete('/api/v1/reminders/templates/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const result = await deleteReminderTemplate(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.get('/api/v1/reminders/invoices/:id/logs', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const logs = await listReminderLogs(params.id);
    reply.send(successResponse(request.auth.requestId, logs));
  });
}
