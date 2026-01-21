import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { listUnreadNotifications, listNotificationsForUser, markAllNotificationsRead, markNotificationRead } from '../services/notifications.js';

export function registerNotificationRoutes(app: FastifyInstance) {
  app.get('/api/v1/notifications', async (request, reply) => {
    const querySchema = z.object({
      limit: z.coerce.number().optional().default(20),
      offset: z.coerce.number().optional().default(0)
    });

    const query = querySchema.parse(request.query);
    const result = await listNotificationsForUser(request.auth?.userId || '', query.limit, query.offset);
    reply.send(successResponse(request.requestId || '', result));
  });

  app.get('/api/v1/notifications/unread', async (request, reply) => {
    const querySchema = z.object({
      limit: z.coerce.number().optional().default(20)
    });

    const query = querySchema.parse(request.query);
    const notifications = await listUnreadNotifications(request.auth?.organizationId || '', query.limit);
    reply.send(successResponse(request.requestId || '', notifications));
  });

  app.post('/api/v1/notifications/:id/read', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);
    await markNotificationRead(params.id, request.auth?.userId || '');
    reply.send(successResponse(request.requestId || '', { success: true }));
  });

  app.post('/api/v1/notifications/read-all', async (request, reply) => {
    await markAllNotificationsRead(request.auth?.userId || '');
    reply.send(successResponse(request.requestId || '', { success: true }));
  });
}
