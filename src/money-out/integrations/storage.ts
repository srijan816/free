import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config.js';

export interface StoredFile {
  fileName: string;
  filePath: string;
  fileUrl: string;
  size: number;
  mimeType: string;
  hash: string;
}

async function ensureDir(dirPath: string) {
  await fs.mkdir(dirPath, { recursive: true });
}

function buildStoragePath(type: 'receipts' | 'attachments', organizationId: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return path.join(config.storagePath, type, organizationId, year, month);
}

function toPublicUrl(filePath: string) {
  return filePath.replace(/\\/g, '/');
}

export async function storeFile(params: {
  organizationId: string;
  type: 'receipts' | 'attachments';
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<StoredFile> {
  const dirPath = buildStoragePath(params.type, params.organizationId);
  await ensureDir(dirPath);

  const hash = crypto.createHash('sha256').update(params.buffer).digest('hex');
  const safeName = params.fileName.replace(/[^a-zA-Z0-9_.-]/g, '_');
  const uniqueName = `${crypto.randomUUID()}_${safeName}`;
  const filePath = path.join(dirPath, uniqueName);

  await fs.writeFile(filePath, params.buffer);

  return {
    fileName: params.fileName,
    filePath,
    fileUrl: toPublicUrl(filePath),
    size: params.buffer.length,
    mimeType: params.mimeType,
    hash
  };
}
