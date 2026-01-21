import { FastifyInstance } from 'fastify';
import { GatewayService } from '../services/gateway.js';
import { RateLimiterService } from '../services/rate-limiter.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { successResponse } from '../utils/api-response.js';
import { db } from '../db/index.js';

export function registerGatewayRoutes(
  app: FastifyInstance,
  gatewayService: GatewayService,
  rateLimiter: RateLimiterService
) {
  app.all('/api/v1/*', async (request, reply) => {
    const auth = request.auth;
    if (!auth) {
      throw new ApiError({
        code: ERROR_CODES.UNAUTHORIZED,
        message: 'Unauthorized',
        statusCode: 401
      });
    }

    const org = await db
      .selectFrom('organizations')
      .select(['subscription_plan'])
      .where('id', '=', auth.organizationId)
      .executeTakeFirst();

    const plan = (org?.subscription_plan || 'free') as any;
    const rateResult = await rateLimiter.checkLimit(auth.organizationId, plan, 'minute');

    if (!rateResult.allowed) {
      reply
        .header('Retry-After', rateResult.retry_after?.toString() || '60')
        .code(429)
        .send({
          success: false,
          error: { code: ERROR_CODES.RATE_LIMITED, message: 'Rate limit exceeded' },
          meta: { request_id: request.requestId, timestamp: new Date().toISOString() }
        });
      return;
    }

    if (request.body && containsDecimalCurrency(request.body)) {
      throw new ApiError({
        code: ERROR_CODES.VALIDATION_ERROR,
        message: 'Currency fields must be integer cents',
        statusCode: 400
      });
    }

    const proxyResponse = await gatewayService.proxy(
      {
        method: request.method,
        path: request.url.split('?')[0],
        headers: request.headers as Record<string, string>,
        body: request.body,
        query: request.query as Record<string, any>
      },
      {
        organizationId: auth.organizationId,
        userId: auth.userId,
        userRole: auth.userRole,
        permissions: auth.permissions ?? [],
        requestId: auth.requestId,
        ipAddress: request.ip
      }
    );

    reply.send(proxyResponse ?? successResponse(request.requestId || '', {}));
  });
}

function containsDecimalCurrency(input: unknown): boolean {
  if (Array.isArray(input)) {
    return input.some((value) => containsDecimalCurrency(value));
  }

  if (input && typeof input === 'object') {
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (/_cents$/.test(key)) {
        if (typeof value === 'string' && value.includes('.')) return true;
        if (typeof value === 'number' && !Number.isInteger(value)) return true;
      }

      if (containsDecimalCurrency(value)) return true;
    }
  }

  return false;
}
