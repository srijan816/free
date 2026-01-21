import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { loadEnv } from '../src/shared/env.js';

loadEnv('config/intelligence.env');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to run intelligence migrations.');
}

const migrations = [
  'src/intelligence/database/migrations/001_create_part3_tables.sql',
  'src/intelligence/database/migrations/002_timescale.sql'
].map((file) => resolve(process.cwd(), file));

for (const migration of migrations) {
  const result = spawnSync('psql', [databaseUrl, '-f', migration], { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
