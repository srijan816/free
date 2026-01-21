import { eventBus } from '../integrations/event-bus.js';
import { db } from '../db/index.js';

export function registerEventConsumers() {
  eventBus.subscribe('expense.billable_receipt_ready', async (event) => {
    const payload = event.payload || {};
    if (!payload.invoice_id || !payload.file_url) return;

    const existing = await db
      .selectFrom('invoice_attachments')
      .select(['id'])
      .where('invoice_id', '=', payload.invoice_id)
      .where('file_url', '=', payload.file_url)
      .executeTakeFirst();

    if (existing) return;

    await db.insertInto('invoice_attachments').values({
      invoice_id: payload.invoice_id,
      file_name: payload.file_name || 'receipt',
      file_url: payload.file_url,
      file_size_bytes: Number(payload.file_size_bytes ?? 0),
      mime_type: payload.mime_type || 'application/octet-stream'
    }).execute();
  });
}
