import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import crypto from 'node:crypto';
import { ZodError } from 'zod';

import { config } from './config.js';
import { ApiError, ERROR_CODES } from './utils/errors.js';
import { errorResponse } from './utils/api-response.js';
import { verifyAccessToken } from './services/auth.js';
import { findUserById } from './services/users.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerUserRoutes } from './routes/users.js';
import { registerOrganizationRoutes } from './routes/organizations.js';
import { registerCategoryRoutes } from './routes/categories.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerUnifiedRoutes } from './routes/unified.js';
import { registerSearchRoutes } from './routes/search.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerGatewayRoutes } from './routes/gateway.js';
import { registerMagicLinkRoutes } from './routes/magic-links.js';
import { registerHomeRoutes } from './routes/home.js';
import { HealthService } from './services/health.js';
import { CircuitBreakerService } from './services/circuit-breaker.js';
import { GatewayService } from './services/gateway.js';
import { RateLimiterService } from './services/rate-limiter.js';
import { EventBusService } from './services/event-bus.js';
import { registerEventConsumers } from './workers/event-consumers.js';
import { WorkflowSchedulerService } from './services/workflow-scheduler.js';

export async function buildServer() {
  const app = Fastify({
    logger: {
      level: config.logLevel
    }
  });

  await app.register(cors, { origin: true });
  await app.register(sensible);

  app.addHook('onRequest', async (request) => {
    const headerId = request.headers['x-request-id'];
    request.requestId = headerId ? String(headerId) : crypto.randomUUID();
  });

  app.addHook('preHandler', async (request) => {
    const url = request.url;
    if (
      url === '/' ||
      url.startsWith('/app') ||
      url.startsWith('/assets') ||
      url === '/favicon.ico' ||
      url.startsWith('/health') ||
      url.startsWith('/api/v1/health') ||
      url.startsWith('/api/v1/auth') ||
      url.startsWith('/api/v1/billing/webhook')
    ) {
      return;
    }

    if (url.startsWith('/api/v1/magic-links')) {
      const internalKey = request.headers['x-internal-key'];
      if (request.method === 'GET' || (config.internalApiKey && internalKey === config.internalApiKey)) {
        return;
      }
    }

    const authHeader = request.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (!token) {
      throw new ApiError({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Missing access token',
        statusCode: 401
      });
    }

    const payload = verifyAccessToken(token);
    const user = await findUserById(payload.sub);

    if (!user || !user.is_active) {
      throw new ApiError({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'User not found or inactive',
        statusCode: 401
      });
    }

    if (user.organization_id !== payload.org_id) {
      throw new ApiError({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Organization mismatch',
        statusCode: 401
      });
    }

    request.auth = {
      organizationId: payload.org_id,
      userId: payload.sub,
      userRole: payload.role,
      permissions: payload.permissions,
      email: payload.email,
      requestId: request.requestId || crypto.randomUUID()
    };
  });

  app.setErrorHandler((error, request, reply) => {
    const requestId = request.requestId || crypto.randomUUID();

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

  const healthService = new HealthService();
  const circuitBreaker = new CircuitBreakerService();
  const gatewayService = new GatewayService(circuitBreaker);
  const rateLimiter = new RateLimiterService();
  const eventBus = new EventBusService();
  const workflowScheduler = new WorkflowSchedulerService(eventBus);

  registerEventConsumers(eventBus, workflowScheduler);
  workflowScheduler.start();

  registerHealthRoutes(app, healthService);
  registerAuthRoutes(app);
  registerUserRoutes(app);
  registerOrganizationRoutes(app);
  registerCategoryRoutes(app);
  registerNotificationRoutes(app);
  registerUnifiedRoutes(app);
  registerSearchRoutes(app);
  registerBillingRoutes(app);
  registerAdminRoutes(app);
  registerMagicLinkRoutes(app);
  registerHomeRoutes(app);

  registerGatewayRoutes(app, gatewayService, rateLimiter);

  return app;
}
