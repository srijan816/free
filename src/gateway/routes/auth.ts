import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { registerUser, loginUser, refreshTokens, logoutUser, requestPasswordReset, resetPassword } from '../services/auth.js';

export function registerAuthRoutes(app: FastifyInstance) {
  app.post('/api/v1/auth/register', async (request, reply) => {
    const bodySchema = z.object({
      email: z.string().email(),
      name: z.string().min(2).max(100),
      password: z
        .string()
        .min(8)
        .max(100)
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
      business_name: z.string().max(200).optional(),
      currency: z.string().optional(),
      timezone: z.string().optional()
    });

    const body = bodySchema.parse(request.body);
    const result = await registerUser(body);
    reply.code(201).send(successResponse(request.requestId || '', result));
  });

  app.post('/api/v1/auth/login', async (request, reply) => {
    const bodySchema = z.object({
      email: z.string().email(),
      password: z.string()
    });

    const body = bodySchema.parse(request.body);
    const result = await loginUser(body, {
      ip_address: request.ip,
      user_agent: request.headers['user-agent']
    });
    reply.send(successResponse(request.requestId || '', result));
  });

  app.post('/api/v1/auth/refresh', async (request, reply) => {
    const bodySchema = z.object({
      refresh_token: z.string()
    });

    const body = bodySchema.parse(request.body);
    const result = await refreshTokens(body.refresh_token);
    reply.send(successResponse(request.requestId || '', result));
  });

  app.post('/api/v1/auth/logout', async (request, reply) => {
    const bodySchema = z.object({
      refresh_token: z.string().optional()
    });

    const body = bodySchema.parse(request.body ?? {});
    if (request.auth?.userId) {
      await logoutUser(request.auth.userId, body.refresh_token);
    }
    reply.send(successResponse(request.requestId || '', { success: true }));
  });

  app.post('/api/v1/auth/forgot-password', async (request, reply) => {
    const bodySchema = z.object({
      email: z.string().email()
    });

    const body = bodySchema.parse(request.body);
    await requestPasswordReset(body.email);
    reply.send(successResponse(request.requestId || '', { success: true }));
  });

  app.post('/api/v1/auth/reset-password', async (request, reply) => {
    const bodySchema = z.object({
      token: z.string(),
      new_password: z
        .string()
        .min(8)
        .max(100)
        .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/)
    });

    const body = bodySchema.parse(request.body);
    await resetPassword(body.token, body.new_password);
    reply.send(successResponse(request.requestId || '', { success: true }));
  });
}
