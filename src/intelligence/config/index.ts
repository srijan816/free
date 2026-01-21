import { loadEnv } from '../../shared/env.js';

loadEnv('config/intelligence.env');

const toNumber = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toBool = (value: string | undefined, fallback: boolean) => {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true';
};

export const config = {
  serviceName: process.env.PART3_SERVICE_NAME || 'intelligence-service',
  port: toNumber(process.env.PART3_PORT, 3003),
  logLevel: process.env.PART3_LOG_LEVEL || 'info',
  database: {
    url: process.env.DATABASE_URL || '',
    poolMin: toNumber(process.env.DATABASE_POOL_MIN, 2),
    poolMax: toNumber(process.env.DATABASE_POOL_MAX, 10),
    ssl: toBool(process.env.DATABASE_SSL, false)
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    cacheTtlSeconds: toNumber(process.env.REDIS_CACHE_TTL, 3600)
  },
  eventBus: {
    url: process.env.EVENT_BUS_URL || 'redis://localhost:6379',
    channelPrefix: process.env.EVENT_BUS_CHANNEL_PREFIX || 'freelancer_suite'
  },
  auth: {
    jwtAccessSecret: process.env.JWT_ACCESS_SECRET || '',
    internalApiKey: process.env.INTERNAL_API_KEY || ''
  },
  integrations: {
    part1Url: process.env.PART1_API_URL || 'http://localhost:3001/api/v1',
    part2Url: process.env.PART2_API_URL || 'http://localhost:3002/api/v1',
    part4Url: process.env.PART4_API_URL || 'http://localhost:3004/api/v1'
  },
  external: {
    exchangeRateApiUrl: process.env.EXCHANGE_RATE_API_URL || '',
    exchangeRateApiKey: process.env.EXCHANGE_RATE_API_KEY || '',
    openaiApiKey: process.env.OPENAI_API_KEY || '',
    openaiModel: process.env.OPENAI_MODEL || 'gpt-4-turbo',
    aiInsightsEnabled: toBool(process.env.AI_INSIGHTS_ENABLED, false),
    aiMaxTokens: toNumber(process.env.AI_MAX_TOKENS, 1000),
    aiTemperature: toNumber(process.env.AI_TEMPERATURE, 0.3)
  },
  featureFlags: {
    aiInsights: toBool(process.env.FEATURE_AI_INSIGHTS, true),
    scheduledReports: toBool(process.env.FEATURE_SCHEDULED_REPORTS, true),
    multiCurrency: toBool(process.env.FEATURE_MULTI_CURRENCY, true),
    budgets: toBool(process.env.FEATURE_BUDGETS, true)
  }
};
