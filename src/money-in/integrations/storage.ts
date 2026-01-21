import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';

export async function ensureStorageDir() {
  await fs.mkdir(config.storagePath, { recursive: true });
}

export async function saveBuffer(fileName: string, buffer: Buffer): Promise<{ filePath: string; fileUrl: string }>{
  await ensureStorageDir();
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const fullPath = path.join(config.storagePath, safeName);
  await fs.writeFile(fullPath, buffer);
  return {
    filePath: fullPath,
    fileUrl: `/storage/${safeName}`
  };
}
