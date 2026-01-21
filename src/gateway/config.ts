import { loadEnv } from '../shared/env.js';
import { z } from 'zod';

loadEnv('config/gateway.env');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.string().default('3004'),
  DATABASE_URL: z.string().default('postgresql://localhost:5432/freelancer_suite'),
  REDIS_URL: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().default('dev-access-secret'),
  JWT_REFRESH_SECRET: z.string().default('dev-refresh-secret'),
  JWT_ACCESS_TTL: z.string().default('900'),
  JWT_REFRESH_TTL: z.string().default('604800'),
  INTERNAL_API_KEY: z.string().optional(),
  PART1_URL: z.string().default('http://localhost:4001'),
  PART2_URL: z.string().default('http://localhost:4002'),
  PART3_URL: z.string().default('http://localhost:3003'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  LOG_LEVEL: z.string().default('info'),
  ADMIN_EMAILS: z.string().optional(),
  REQUIRE_EMAIL_VERIFICATION: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

const requireEmailVerification = parsed.data.REQUIRE_EMAIL_VERIFICATION
  ? parsed.data.REQUIRE_EMAIL_VERIFICATION.toLowerCase() === 'true'
  : false;

export const config = {
  env: parsed.data.NODE_ENV,
  port: Number(parsed.data.PORT),
  databaseUrl: parsed.data.DATABASE_URL,
  redisUrl: parsed.data.REDIS_URL,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  jwtRefreshSecret: parsed.data.JWT_REFRESH_SECRET,
  jwtAccessTtl: Number(parsed.data.JWT_ACCESS_TTL),
  jwtRefreshTtl: Number(parsed.data.JWT_REFRESH_TTL),
  internalApiKey: parsed.data.INTERNAL_API_KEY,
  part1Url: parsed.data.PART1_URL,
  part2Url: parsed.data.PART2_URL,
  part3Url: parsed.data.PART3_URL,
  appBaseUrl: parsed.data.APP_BASE_URL,
  logLevel: parsed.data.LOG_LEVEL,
  adminEmails: parsed.data.ADMIN_EMAILS
    ? parsed.data.ADMIN_EMAILS.split(',').map((email) => email.trim()).filter(Boolean)
    : [],
  requireEmailVerification
};

export type AppConfig = typeof config;
