import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import {
  getSubscription,
  createCheckoutSession,
  createBillingPortalSession,
  cancelSubscription,
  resumeSubscription,
  getBillingHistory,
  getUsage
} from '../services/billing.js';
import { SubscriptionPlan } from '../constants/index.js';

export function registerBillingRoutes(app: FastifyInstance) {
  app.get('/api/v1/billing/subscription', async (request, reply) => {
    const result = await getSubscription(request.auth?.organizationId || '');
    reply.send(successResponse(request.requestId || '', result));
  });

  app.post('/api/v1/billing/checkout', async (request, reply) => {
    const bodySchema = z.object({
      plan: z.enum(['free', 'starter', 'professional', 'business']),
      billing_period: z.enum(['monthly', 'yearly'])
    });

    const body = bodySchema.parse(request.body);
    const result = await createCheckoutSession(
      request.auth?.organizationId || '',
      body.plan as SubscriptionPlan,
      body.billing_period
    );
    reply.send(successResponse(request.requestId || '', result));
  });

  app.post('/api/v1/billing/portal', async (request, reply) => {
    const result = await createBillingPortalSession(request.auth?.organizationId || '');
    reply.send(successResponse(request.requestId || '', result));
  });

  app.post('/api/v1/billing/cancel', async (request, reply) => {
    await cancelSubscription(request.auth?.organizationId || '');
    reply.send(successResponse(request.requestId || '', { success: true }));
  });

  app.post('/api/v1/billing/resume', async (request, reply) => {
    await resumeSubscription(request.auth?.organizationId || '');
    reply.send(successResponse(request.requestId || '', { success: true }));
  });

  app.get('/api/v1/billing/history', async (request, reply) => {
    const querySchema = z.object({
      limit: z.coerce.number().optional(),
      offset: z.coerce.number().optional()
    });

    const query = querySchema.parse(request.query);
    const result = await getBillingHistory(request.auth?.organizationId || '', query);
    reply.send(successResponse(request.requestId || '', result));
  });

  app.get('/api/v1/billing/usage', async (request, reply) => {
    const result = await getUsage(request.auth?.organizationId || '');
    reply.send(successResponse(request.requestId || '', result));
  });

  app.post('/api/v1/billing/webhook', async (request, reply) => {
    reply.send(successResponse(request.requestId || '', { received: true }));
  });
}
