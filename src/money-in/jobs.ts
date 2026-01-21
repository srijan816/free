import cron from 'node-cron';
import { db, closeDb } from './db/index.js';
import { processRecurringSchedules } from './services/recurring.js';
import { processAutomaticReminders } from './services/reminders.js';

async function updateOverdueInvoices() {
  const today = new Date().toISOString().split('T')[0];

  const overdueInvoices = await db
    .selectFrom('invoices')
    .select(['id'])
    .where('status', 'in', ['sent', 'viewed', 'partial'] as any)
    .where('due_date', '<', today)
    .execute();

  if (!overdueInvoices.length) return;

  await db
    .updateTable('invoices')
    .set({ status: 'overdue' })
    .where('id', 'in', overdueInvoices.map((inv: any) => inv.id))
    .execute();

  for (const invoice of overdueInvoices) {
    await db.insertInto('invoice_activities').values({
      invoice_id: invoice.id,
      activity_type: 'status_changed',
      description: 'Invoice marked overdue'
    }).execute();
  }
}

async function start() {
  cron.schedule('0 6 * * *', async () => {
    await processRecurringSchedules();
  });

  cron.schedule('0 9 * * *', async () => {
    await processAutomaticReminders();
  });

  cron.schedule('0 0 * * *', async () => {
    await updateOverdueInvoices();
  });

  process.on('SIGINT', async () => {
    await closeDb();
    process.exit(0);
  });
}

start().catch(async (err) => {
  console.error(err);
  await closeDb();
  process.exit(1);
});
