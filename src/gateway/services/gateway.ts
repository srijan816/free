import { config } from '../config.js';
import { SERVICES } from '../constants/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { CircuitBreakerService } from './circuit-breaker.js';

interface RouteConfig {
  service: string;
  baseUrl: string;
  timeoutMs: number;
  retries: number;
}

export interface ProxyRequest {
  method: string;
  path: string;
  headers: Record<string, string | string[] | undefined>;
  body?: any;
  query?: Record<string, any>;
}

export interface RequestContext {
  organizationId: string;
  userId: string;
  userRole: string;
  permissions?: string[];
  requestId: string;
  ipAddress: string;
}

export class GatewayService {
  private readonly routes: Map<string, RouteConfig>;

  constructor(private readonly circuitBreaker: CircuitBreakerService) {
    this.routes = new Map([
      ['/api/v1/clients', { service: SERVICES.PART1_MONEY_IN, baseUrl: config.part1Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/invoices', { service: SERVICES.PART1_MONEY_IN, baseUrl: config.part1Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/payments', { service: SERVICES.PART1_MONEY_IN, baseUrl: config.part1Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/escrow', { service: SERVICES.PART1_MONEY_IN, baseUrl: config.part1Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/recurring', { service: SERVICES.PART1_MONEY_IN, baseUrl: config.part1Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/reminders', { service: SERVICES.PART1_MONEY_IN, baseUrl: config.part1Url, timeoutMs: 10000, retries: 1 }],
      ['/api/v1/portal', { service: SERVICES.PART1_MONEY_IN, baseUrl: config.part1Url, timeoutMs: 15000, retries: 1 }],
      ['/api/v1/payment-links', { service: SERVICES.PART1_MONEY_IN, baseUrl: config.part1Url, timeoutMs: 10000, retries: 1 }],

      ['/api/v1/expenses', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/vendors', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/receipts', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 15000, retries: 1 }],
      ['/api/v1/bank-connections', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 30000, retries: 1 }],
      ['/api/v1/bank-accounts', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/transactions', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/mileage', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/vehicles', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/categorization-rules', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/recurring-expenses', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/webhooks', { service: SERVICES.PART2_MONEY_OUT, baseUrl: config.part2Url, timeoutMs: 10000, retries: 1 }],

      ['/api/v1/dashboard', { service: SERVICES.PART3_INTELLIGENCE, baseUrl: config.part3Url, timeoutMs: 15000, retries: 2 }],
      ['/api/v1/reports', { service: SERVICES.PART3_INTELLIGENCE, baseUrl: config.part3Url, timeoutMs: 30000, retries: 1 }],
      ['/api/v1/tax', { service: SERVICES.PART3_INTELLIGENCE, baseUrl: config.part3Url, timeoutMs: 15000, retries: 2 }],
      ['/api/v1/forecasts', { service: SERVICES.PART3_INTELLIGENCE, baseUrl: config.part3Url, timeoutMs: 15000, retries: 2 }],
      ['/api/v1/insights', { service: SERVICES.PART3_INTELLIGENCE, baseUrl: config.part3Url, timeoutMs: 10000, retries: 2 }],
      ['/api/v1/exports', { service: SERVICES.PART3_INTELLIGENCE, baseUrl: config.part3Url, timeoutMs: 60000, retries: 0 }],
      ['/api/v1/budgets', { service: SERVICES.PART3_INTELLIGENCE, baseUrl: config.part3Url, timeoutMs: 10000, retries: 2 }]
    ]);
  }

  async proxy(request: ProxyRequest, context: RequestContext) {
    const route = this.findRoute(request.path);
    if (!route) {
      throw new ApiError({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Route not found',
        statusCode: 404
      });
    }

    if (this.circuitBreaker.isOpen(route.service)) {
      throw new ApiError({
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Service temporarily unavailable',
        statusCode: 503
      });
    }

    let lastError: any;

    for (let attempt = 0; attempt <= route.retries; attempt += 1) {
      try {
        const response = await this.makeRequest(route, request, context);
        this.circuitBreaker.recordSuccess(route.service);
        return response;
      } catch (error) {
        lastError = error;
        this.circuitBreaker.recordFailure(route.service);

        if (error instanceof ApiError && error.statusCode >= 400 && error.statusCode < 500) {
          throw error;
        }

        if (attempt < route.retries) {
          await delay(Math.pow(2, attempt) * 100);
        }
      }
    }

    throw lastError ?? new ApiError({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Upstream service unavailable',
      statusCode: 503
    });
  }

  private findRoute(path: string): RouteConfig | undefined {
    let bestMatch: RouteConfig | undefined;
    let bestLength = 0;

    for (const [prefix, configEntry] of this.routes.entries()) {
      if (path.startsWith(prefix) && prefix.length > bestLength) {
        bestMatch = configEntry;
        bestLength = prefix.length;
      }
    }

    return bestMatch;
  }

  private async makeRequest(route: RouteConfig, request: ProxyRequest, context: RequestContext) {
    const url = `${route.baseUrl}${request.path}`;
    const headers: Record<string, string> = {};

    for (const [key, value] of Object.entries(request.headers)) {
      if (!value) continue;
      if (Array.isArray(value)) {
        headers[key.toLowerCase()] = value.join(',');
      } else {
        headers[key.toLowerCase()] = value;
      }
    }

    delete headers['host'];
    delete headers['content-length'];

    if (request.body && !headers['content-type']) {
      headers['content-type'] = 'application/json';
    }

    headers['x-organization-id'] = context.organizationId;
    headers['x-user-id'] = context.userId;
    headers['x-user-role'] = context.userRole;
    headers['x-user-permissions'] = context.permissions?.join(',') || '';
    headers['x-request-id'] = context.requestId;
    headers['x-forwarded-for'] = context.ipAddress;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), route.timeoutMs);

    try {
      const response = await fetch(urlWithQuery(url, request.query), {
        method: request.method,
        headers,
        body: request.body ? JSON.stringify(request.body) : undefined,
        signal: controller.signal
      });

      const text = await response.text();
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        data = text;
      }

      if (!response.ok) {
        throw new ApiError({
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          message: data?.error?.message || 'Upstream error',
          statusCode: response.status,
          details: { upstream: data }
        });
      }

      return data;
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw new ApiError({
          code: ERROR_CODES.SERVICE_UNAVAILABLE,
          message: 'Request timeout',
          statusCode: 504
        });
      }
      if (error instanceof ApiError) {
        throw error;
      }
      throw new ApiError({
        code: ERROR_CODES.SERVICE_UNAVAILABLE,
        message: 'Service unavailable',
        statusCode: 503
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function urlWithQuery(url: string, query?: Record<string, any>) {
  if (!query || Object.keys(query).length === 0) return url;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    searchParams.set(key, String(value));
  }
  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}
