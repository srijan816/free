import { loadEnv } from '../shared/env.js';
import { z } from 'zod';

loadEnv('config/money-in.env');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('money-in-service'),
  PORT: z.string().default('4001'),
  DATABASE_URL: z.string().default('postgresql://localhost:5432/free_money_in'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  STORAGE_PATH: z.string().default('./storage'),
  SENDGRID_API_KEY: z.string().optional(),
  SENDGRID_FROM_EMAIL: z.string().default('no-reply@free.local'),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  EVENT_BUS_URL: z.string().optional(),
  PART4_API_URL: z.string().default('http://localhost:3004'),
  JWT_ACCESS_SECRET: z.string().optional(),
  INTERNAL_API_KEY: z.string().optional()
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n');
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const config = {
  env: parsed.data.NODE_ENV,
  serviceName: parsed.data.SERVICE_NAME,
  port: Number(parsed.data.PORT),
  databaseUrl: parsed.data.DATABASE_URL,
  appBaseUrl: parsed.data.APP_BASE_URL,
  storagePath: parsed.data.STORAGE_PATH,
  sendgridApiKey: parsed.data.SENDGRID_API_KEY,
  sendgridFromEmail: parsed.data.SENDGRID_FROM_EMAIL,
  stripeSecretKey: parsed.data.STRIPE_SECRET_KEY,
  stripeWebhookSecret: parsed.data.STRIPE_WEBHOOK_SECRET,
  logLevel: parsed.data.LOG_LEVEL,
  eventBusUrl: parsed.data.EVENT_BUS_URL,
  part4ApiUrl: parsed.data.PART4_API_URL,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET,
  internalApiKey: parsed.data.INTERNAL_API_KEY
};

export type AppConfig = typeof config;
