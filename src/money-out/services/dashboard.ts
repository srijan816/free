import { sql } from 'kysely';
import { db } from '../db/index.js';

export async function getDashboardData(organizationId: string) {
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const startOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const endOfLastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));

  const thisMonthTotal = await db
    .selectFrom('expenses')
    .select(sql<number>`coalesce(sum(amount_cents), 0)`.as('total'))
    .where('organization_id', '=', organizationId)
    .where('date', '>=', startOfMonth.toISOString().split('T')[0])
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  const lastMonthTotal = await db
    .selectFrom('expenses')
    .select(sql<number>`coalesce(sum(amount_cents), 0)`.as('total'))
    .where('organization_id', '=', organizationId)
    .where('date', '>=', startOfLastMonth.toISOString().split('T')[0])
    .where('date', '<=', endOfLastMonth.toISOString().split('T')[0])
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  const byCategory = await db
    .selectFrom('expenses')
    .innerJoin('categories', 'categories.id', 'expenses.category_id')
    .select([
      'expenses.category_id',
      'categories.name',
      sql<number>`sum(expenses.amount_cents)`.as('amount_cents')
    ])
    .where('expenses.organization_id', '=', organizationId)
    .where('expenses.date', '>=', startOfMonth.toISOString().split('T')[0])
    .where('expenses.deleted_at', 'is', null)
    .groupBy(['expenses.category_id', 'categories.name'])
    .execute();

  const totalThisMonth = Number(thisMonthTotal?.total ?? 0);
  const totalLastMonth = Number(lastMonthTotal?.total ?? 0);
  const changePercentage = totalLastMonth ? ((totalThisMonth - totalLastMonth) / totalLastMonth) * 100 : 0;

  const recent = await db
    .selectFrom('expenses')
    .innerJoin('categories', 'categories.id', 'expenses.category_id')
    .select([
      'expenses.id',
      'expenses.description',
      'expenses.amount_cents',
      'expenses.date',
      'categories.name as category_name'
    ])
    .where('expenses.organization_id', '=', organizationId)
    .where('expenses.deleted_at', 'is', null)
    .orderBy('expenses.date', 'desc')
    .limit(5)
    .execute();

  const accounts = await db
    .selectFrom('bank_accounts')
    .innerJoin('bank_connections', 'bank_connections.id', 'bank_accounts.bank_connection_id')
    .select([
      'bank_accounts.id',
      'bank_accounts.name',
      'bank_accounts.type',
      'bank_accounts.current_balance_cents',
      'bank_connections.institution_name'
    ])
    .where('bank_accounts.organization_id', '=', organizationId)
    .where('bank_accounts.is_visible', '=', true)
    .execute();

  const totalBalance = accounts.reduce((sum, account: any) => sum + Number(account.current_balance_cents ?? 0), 0);

  const lastSync = await db
    .selectFrom('bank_connections')
    .select(sql`max(last_sync_at)`.as('last_sync_at'))
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  const transactionsToReview = await db
    .selectFrom('bank_transactions')
    .select(sql<number>`count(*)`.as('count'))
    .where('organization_id', '=', organizationId)
    .where((eb) => eb.or([eb('is_categorized', '=', false), eb('categorization_confidence', '<', 70)]))
    .executeTakeFirst();

  const receiptsToMatch = await db
    .selectFrom('receipts')
    .select(sql<number>`count(*)`.as('count'))
    .where('organization_id', '=', organizationId)
    .where('status', '=', 'processed')
    .where('expense_id', 'is', null)
    .executeTakeFirst();

  const reauthCount = await db
    .selectFrom('bank_connections')
    .select(sql<number>`count(*)`.as('count'))
    .where('organization_id', '=', organizationId)
    .where('requires_reauth', '=', true)
    .executeTakeFirst();

  return {
    expenses: {
      total_this_month_cents: totalThisMonth,
      total_last_month_cents: totalLastMonth,
      change_percentage: Number(changePercentage.toFixed(2)),
      by_category: byCategory.map((row: any) => ({
        category_id: row.category_id,
        category_name: row.name,
        amount_cents: Number(row.amount_cents ?? 0),
        percentage: totalThisMonth ? Math.round((Number(row.amount_cents ?? 0) / totalThisMonth) * 100) : 0
      })),
      recent
    },
    bank_accounts: {
      total_balance_cents: totalBalance,
      accounts: accounts.map((account: any) => ({
        id: account.id,
        name: account.name,
        institution_name: account.institution_name,
        balance_cents: account.current_balance_cents,
        type: account.type
      })),
      last_sync_at: lastSync?.last_sync_at ?? null
    },
    action_items: {
      transactions_to_review: Number(transactionsToReview?.count ?? 0),
      receipts_to_match: Number(receiptsToMatch?.count ?? 0),
      bank_connections_need_reauth: Number(reauthCount?.count ?? 0)
    }
  };
}
