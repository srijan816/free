import { FastifyInstance } from 'fastify';
import { successResponse } from '../utils/api-response.js';
import { findUserById } from '../services/users.js';

export function registerUserRoutes(app: FastifyInstance) {
  app.get('/api/v1/users/me', async (request, reply) => {
    const user = await findUserById(request.auth?.userId || '');
    reply.send(successResponse(request.requestId || '', user));
  });
}
