import dotenv from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rootEnvPath = resolve(projectRoot, '.env');

export const loadEnv = (relativePath: string) => {
  dotenv.config({ path: rootEnvPath });
  const envPath = resolve(projectRoot, relativePath);
  dotenv.config({ path: envPath });
  return envPath;
};
