import { loadEnv } from '../shared/env.js';
import { z } from 'zod';

loadEnv('config/money-out.env');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  SERVICE_NAME: z.string().default('money-out-service'),
  PORT: z.string().default('4002'),
  DATABASE_URL: z.string().default('postgresql://localhost:5432/free_money_out'),
  APP_BASE_URL: z.string().default('http://localhost:3000'),
  STORAGE_PATH: z.string().default('./storage'),
  LOG_LEVEL: z.string().default('info'),
  PLAID_CLIENT_ID: z.string().optional(),
  PLAID_SECRET: z.string().optional(),
  PLAID_ENVIRONMENT: z.enum(['sandbox', 'development', 'production']).default('sandbox'),
  PLAID_WEBHOOK_URL: z.string().optional(),
  OCR_PROVIDER: z.string().default('stub'),
  GOOGLE_CLOUD_PROJECT_ID: z.string().optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  AI_PROVIDER: z.string().default('stub'),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AWS_REGION: z.string().optional(),
  S3_BUCKET_RECEIPTS: z.string().optional(),
  S3_BUCKET_ATTACHMENTS: z.string().optional(),
  EVENT_BUS_URL: z.string().optional(),
  EVENT_BUS_PREFIX: z.string().default('freelancer-suite'),
  PART1_API_URL: z.string().default('http://localhost:4001'),
  PART4_API_URL: z.string().default('http://localhost:3004'),
  JWT_ACCESS_SECRET: z.string().optional()
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
  logLevel: parsed.data.LOG_LEVEL,
  plaidClientId: parsed.data.PLAID_CLIENT_ID,
  plaidSecret: parsed.data.PLAID_SECRET,
  plaidEnvironment: parsed.data.PLAID_ENVIRONMENT,
  plaidWebhookUrl: parsed.data.PLAID_WEBHOOK_URL,
  ocrProvider: parsed.data.OCR_PROVIDER,
  googleProjectId: parsed.data.GOOGLE_CLOUD_PROJECT_ID,
  googleCredentials: parsed.data.GOOGLE_APPLICATION_CREDENTIALS,
  aiProvider: parsed.data.AI_PROVIDER,
  openaiApiKey: parsed.data.OPENAI_API_KEY,
  anthropicApiKey: parsed.data.ANTHROPIC_API_KEY,
  aiModel: parsed.data.AI_MODEL,
  awsRegion: parsed.data.AWS_REGION,
  s3BucketReceipts: parsed.data.S3_BUCKET_RECEIPTS,
  s3BucketAttachments: parsed.data.S3_BUCKET_ATTACHMENTS,
  eventBusUrl: parsed.data.EVENT_BUS_URL,
  eventBusPrefix: parsed.data.EVENT_BUS_PREFIX,
  part1ApiUrl: parsed.data.PART1_API_URL,
  part4ApiUrl: parsed.data.PART4_API_URL,
  jwtAccessSecret: parsed.data.JWT_ACCESS_SECRET
};

export type AppConfig = typeof config;
