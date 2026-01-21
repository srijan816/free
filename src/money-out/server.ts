import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import multipart from '@fastify/multipart';
import { ZodError } from 'zod';

import { errorResponse } from './utils/api-response.js';
import { ApiError, ERROR_CODES } from './utils/errors.js';
import { parseAuthHeaders } from './utils/auth.js';
import { config } from './config.js';

import { registerExpenseRoutes } from './routes/expenses.js';
import { registerVendorRoutes } from './routes/vendors.js';
import { registerReceiptRoutes } from './routes/receipts.js';
import { registerBankConnectionRoutes } from './routes/bank-connections.js';
import { registerBankAccountRoutes } from './routes/bank-accounts.js';
import { registerTransactionRoutes } from './routes/transactions.js';
import { registerRuleRoutes } from './routes/categorization-rules.js';
import { registerRecurringExpenseRoutes } from './routes/recurring-expenses.js';
import { registerMileageRoutes } from './routes/mileage.js';
import { registerVehicleRoutes } from './routes/vehicles.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerWebhookRoutes } from './routes/webhooks.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024
    }
  });

  app.addHook('preHandler', async (request) => {
    if (request.url.startsWith('/health') || request.url.startsWith('/webhooks/')) {
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

  app.get('/health', async () => ({ status: 'ok', service: 'money-out' }));

  registerExpenseRoutes(app);
  registerVendorRoutes(app);
  registerReceiptRoutes(app);
  registerBankConnectionRoutes(app);
  registerBankAccountRoutes(app);
  registerTransactionRoutes(app);
  registerRuleRoutes(app);
  registerRecurringExpenseRoutes(app);
  registerMileageRoutes(app);
  registerVehicleRoutes(app);
  registerDashboardRoutes(app);
  registerWebhookRoutes(app);

  return app;
}
