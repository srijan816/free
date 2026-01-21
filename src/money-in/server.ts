import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { ZodError } from 'zod';

import { errorResponse } from './utils/api-response.js';
import { ApiError, ERROR_CODES } from './utils/errors.js';
import { parseAuthHeaders } from './utils/auth.js';
import { config } from './config.js';

import { registerClientRoutes } from './routes/clients.js';
import { registerInvoiceRoutes } from './routes/invoices.js';
import { registerPaymentRoutes } from './routes/payments.js';
import { registerEscrowRoutes } from './routes/escrow.js';
import { registerRecurringRoutes } from './routes/recurring.js';
import { registerReminderRoutes } from './routes/reminders.js';
import { registerPortalRoutes } from './routes/portal.js';
import { registerPaymentLinkRoutes } from './routes/payment-links.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);

  app.addHook('preHandler', async (request) => {
    if (
      request.url.startsWith('/health') ||
      request.url.startsWith('/api/v1/portal/') ||
      request.url.startsWith('/pay/') ||
      request.url.startsWith('/webhooks/')
    ) {
      return;
    }
    request.auth = parseAuthHeaders(request.headers as Record<string, unknown>);
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.auth?.requestId ?? request.headers['x-request-id']?.toString() ?? crypto.randomUUID();

    if (error instanceof ApiError) {
      reply
        .status(error.statusCode)
        .send(
          errorResponse(requestId, {
            code: error.code,
            message: error.message,
            details: error.details,
            field_errors: error.fieldErrors
          })
        );
      return;
    }

    if (error instanceof ZodError) {
      const fieldErrors = error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
        code: 'INVALID'
      }));

      reply.status(400).send(
        errorResponse(requestId, {
          code: ERROR_CODES.VALIDATION_ERROR,
          message: 'Invalid input data',
          field_errors: fieldErrors
        })
      );
      return;
    }

    request.log.error({ err: error }, 'Unhandled error');
    reply.status(500).send(
      errorResponse(requestId, {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'Unexpected error'
      })
    );
  });

  app.get('/health', async () => ({ status: 'ok', service: 'money-in' }));

  registerClientRoutes(app);
  registerInvoiceRoutes(app);
  registerPaymentRoutes(app);
  registerEscrowRoutes(app);
  registerRecurringRoutes(app);
  registerReminderRoutes(app);
  registerPortalRoutes(app);
  registerPaymentLinkRoutes(app);

  return app;
}
