import { db } from '../db/index.js';

export async function logAudit(payload: Record<string, any>) {
  await db.insertInto('audit_logs').values(payload).execute();
}
