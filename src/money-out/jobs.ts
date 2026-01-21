import cron from 'node-cron';
import { db, closeDb } from './db/index.js';
import { processRecurringExpenses } from './services/recurring-expenses.js';
import { sql } from 'kysely';

async function cleanupDeletedExpenses() {
  const cutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  await db
    .deleteFrom('expenses')
    .where('deleted_at', '<', cutoff)
    .execute();
}

async function updateVendorStats() {
  const vendors = await db.selectFrom('vendors').select(['id']).execute();
  for (const vendor of vendors as any[]) {
    await db
      .updateTable('vendors')
      .set({
        total_spent_cents: sql`(SELECT COALESCE(SUM(amount_cents), 0) FROM expenses WHERE vendor_id = ${vendor.id} AND deleted_at IS NULL)`,
        expense_count: sql`(SELECT COUNT(*) FROM expenses WHERE vendor_id = ${vendor.id} AND deleted_at IS NULL)`,
        last_expense_date: sql`(SELECT MAX(date) FROM expenses WHERE vendor_id = ${vendor.id} AND deleted_at IS NULL)`
      })
      .where('id', '=', vendor.id)
      .execute();
  }
}

async function start() {
  cron.schedule('0 6 * * *', async () => {
    await processRecurringExpenses();
  });

  cron.schedule('0 3 * * *', async () => {
    await updateVendorStats();
  });

  cron.schedule('0 4 * * 0', async () => {
    await cleanupDeletedExpenses();
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
