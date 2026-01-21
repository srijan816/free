import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getRequestId } from '../utils/auth.js';
import { getInvoiceByPaymentToken, createPaymentIntentForToken, confirmPaymentIntent } from '../services/payment-links.js';

export function registerPaymentLinkRoutes(app: FastifyInstance) {
  app.get('/pay/:token', async (request, reply) => {
    const paramsSchema = z.object({ token: z.string() });
    const params = paramsSchema.parse(request.params);

    const data = await getInvoiceByPaymentToken(params.token);
    reply.send(successResponse(getRequestId(request.headers as Record<string, unknown>), data));
  });

  app.post('/pay/:token/create-intent', async (request, reply) => {
    const paramsSchema = z.object({ token: z.string() });
    const params = paramsSchema.parse(request.params);

    const intent = await createPaymentIntentForToken(params.token);
    reply.send(successResponse(getRequestId(request.headers as Record<string, unknown>), intent));
  });

  app.post('/pay/:token/confirm', async (request, reply) => {
    const paramsSchema = z.object({ token: z.string() });
    const bodySchema = z.object({ payment_intent_id: z.string() });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await confirmPaymentIntent(params.token, body.payment_intent_id);
    reply.send(successResponse(getRequestId(request.headers as Record<string, unknown>), result));
  });

  app.post('/webhooks/stripe', async (request, reply) => {
    const bodySchema = z.object({
      type: z.string(),
      data: z.object({ object: z.record(z.any()) })
    });

    const body = bodySchema.parse(request.body);

    if (body.type === 'payment_intent.succeeded') {
      const intentId = String(body.data.object.id ?? '');
      const token = String(body.data.object.metadata?.payment_link_token ?? '');
      if (intentId && token) {
        await confirmPaymentIntent(token, intentId);
      }
    }

    reply.send({ received: true });
  });
}
