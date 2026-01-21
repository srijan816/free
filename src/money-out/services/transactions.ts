import { sql } from 'kysely';
import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { categorizeTransaction } from './categorization.js';
import { findOrCreateVendorFromMerchant } from './vendors.js';
import { eventBus } from '../integrations/event-bus.js';
import type { PlaidTransaction } from '../integrations/plaid.js';

interface ListTransactionOptions {
  page: number;
  perPage: number;
  account_id?: string;
  date_from?: string;
  date_to?: string;
  is_categorized?: boolean;
  is_business?: boolean;
  is_pending?: boolean;
  needs_review?: boolean;
  category_id?: string;
  vendor_id?: string;
  min_amount?: number;
  max_amount?: number;
  transaction_type?: string;
  search?: string;
  sort?: string;
}

export async function listTransactions(organizationId: string, options: ListTransactionOptions) {
  let query = db
    .selectFrom('bank_transactions')
    .leftJoin('categories', 'categories.id', 'bank_transactions.category_id')
    .select([
      'bank_transactions.id',
      'bank_transactions.date',
      'bank_transactions.name',
      'bank_transactions.merchant_name',
      'bank_transactions.amount_cents',
      'bank_transactions.transaction_type',
      'bank_transactions.is_pending',
      'bank_transactions.is_business',
      'bank_transactions.categorization_method',
      'bank_transactions.categorization_confidence',
      'bank_transactions.is_categorized',
      'bank_transactions.expense_id',
      sql`json_build_object('id', categories.id, 'name', categories.name)`.as('category')
    ])
    .where('bank_transactions.organization_id', '=', organizationId);

  if (options.account_id) {
    query = query.where('bank_transactions.bank_account_id', '=', options.account_id);
  }

  if (options.date_from) {
    query = query.where('bank_transactions.date', '>=', options.date_from);
  }

  if (options.date_to) {
    query = query.where('bank_transactions.date', '<=', options.date_to);
  }

  if (options.is_categorized != null) {
    query = query.where('bank_transactions.is_categorized', '=', options.is_categorized);
  }

  if (options.is_business != null) {
    query = query.where('bank_transactions.is_business', '=', options.is_business);
  }

  if (options.is_pending != null) {
    query = query.where('bank_transactions.is_pending', '=', options.is_pending);
  }

  if (options.needs_review) {
    query = query.where((eb) =>
      eb.or([
        eb('bank_transactions.is_categorized', '=', false),
        eb('bank_transactions.categorization_confidence', '<', 70)
      ])
    );
  }

  if (options.category_id) {
    query = query.where('bank_transactions.category_id', '=', options.category_id);
  }

  if (options.vendor_id) {
    query = query.where('bank_transactions.vendor_id', '=', options.vendor_id);
  }

  if (options.min_amount != null) {
    query = query.where('bank_transactions.amount_cents', '>=', options.min_amount);
  }

  if (options.max_amount != null) {
    query = query.where('bank_transactions.amount_cents', '<=', options.max_amount);
  }

  if (options.transaction_type) {
    query = query.where('bank_transactions.transaction_type', '=', options.transaction_type as any);
  }

  if (options.search) {
    const search = `%${options.search.toLowerCase()}%`;
    query = query.where((eb) =>
      eb.or([
        eb('bank_transactions.name', 'ilike', search),
        eb('bank_transactions.merchant_name', 'ilike', search)
      ])
    );
  }

  const countRow = await query
    .select((eb) => eb.fn.count('bank_transactions.id').as('total'))
    .executeTakeFirst();
  const total = Number(countRow?.total ?? 0);

  const sortMap: Record<string, string> = {
    date: 'bank_transactions.date',
    amount_cents: 'bank_transactions.amount_cents',
    name: 'bank_transactions.name'
  };
  const sortKey = options.sort?.replace('-', '') ?? 'date';
  const sortColumn = sortMap[sortKey] ?? 'bank_transactions.date';
  const sortDirection = options.sort?.startsWith('-') ? 'desc' : 'asc';

  const data = await query
    .orderBy(sortColumn as never, sortDirection as never)
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage)
    .execute();

  const summaryRow = await db
    .selectFrom('bank_transactions')
    .select([
      sql<number>`sum(CASE WHEN amount_cents > 0 THEN amount_cents ELSE 0 END)`.as('total_debit_cents'),
      sql<number>`sum(CASE WHEN amount_cents < 0 THEN amount_cents ELSE 0 END)`.as('total_credit_cents'),
      sql<number>`sum(CASE WHEN is_categorized = false OR categorization_confidence < 70 THEN 1 ELSE 0 END)`.as('needs_review_count'),
      sql<number>`sum(CASE WHEN is_categorized = false THEN 1 ELSE 0 END)`.as('uncategorized_count')
    ])
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  return {
    data,
    total,
    summary: {
      total_debit_cents: Number(summaryRow?.total_debit_cents ?? 0),
      total_credit_cents: Number(summaryRow?.total_credit_cents ?? 0),
      needs_review_count: Number(summaryRow?.needs_review_count ?? 0),
      uncategorized_count: Number(summaryRow?.uncategorized_count ?? 0)
    }
  };
}

export async function getTransaction(organizationId: string, transactionId: string) {
  const transaction = await db
    .selectFrom('bank_transactions')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', transactionId)
    .executeTakeFirst();

  if (!transaction) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Transaction not found',
      statusCode: 404
    });
  }

  const account = await db
    .selectFrom('bank_accounts')
    .innerJoin('bank_connections', 'bank_connections.id', 'bank_accounts.bank_connection_id')
    .select([
      'bank_accounts.id',
      'bank_accounts.name',
      'bank_connections.institution_name'
    ])
    .where('bank_accounts.id', '=', transaction.bank_account_id)
    .executeTakeFirst();

  const category = transaction.category_id
    ? await db.selectFrom('categories').select(['id', 'name']).where('id', '=', transaction.category_id).executeTakeFirst()
    : null;

  const vendor = transaction.vendor_id
    ? await db.selectFrom('vendors').select(['id', 'name']).where('id', '=', transaction.vendor_id).executeTakeFirst()
    : null;

  return {
    ...transaction,
    bank_account: account,
    category,
    vendor
  };
}

export async function updateTransaction(organizationId: string, transactionId: string, updates: Record<string, any>, userId: string) {
  const updated = await db
    .updateTable('bank_transactions')
    .set({
      category_id: updates.category_id,
      vendor_id: updates.vendor_id,
      is_business: updates.is_business,
      is_excluded: updates.is_excluded,
      notes: updates.notes,
      tags: updates.tags,
      categorization_method: updates.category_id ? 'manual' : undefined,
      categorization_confidence: updates.category_id ? 100 : undefined,
      categorized_at: updates.category_id ? new Date().toISOString() : undefined,
      categorized_by_user_id: updates.category_id ? userId : undefined,
      is_categorized: updates.category_id ? true : undefined
    })
    .where('organization_id', '=', organizationId)
    .where('id', '=', transactionId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Transaction not found',
      statusCode: 404
    });
  }

  eventBus.publish('transaction.categorized', {
    transaction_id: transactionId,
    organization_id: organizationId,
    category_id: updates.category_id,
    categorization_method: 'manual',
    confidence: 100
  });

  return updated;
}

export async function bulkCategorizeTransactions(organizationId: string, transactionIds: string[], categoryId: string, createRule: boolean, ruleName?: string) {
  await db
    .updateTable('bank_transactions')
    .set({
      category_id: categoryId,
      is_categorized: true,
      categorization_method: 'manual',
      categorization_confidence: 100,
      categorized_at: new Date().toISOString()
    })
    .where('organization_id', '=', organizationId)
    .where('id', 'in', transactionIds as any)
    .execute();

  let rule: any = null;
  if (createRule) {
    rule = await db
      .insertInto('categorization_rules')
      .values({
        organization_id: organizationId,
        name: ruleName ?? 'Bulk rule',
        conditions: [{ field: 'merchant_name', operator: 'contains', value: 'Bulk' }],
        category_id: categoryId,
        priority: 0,
        is_active: true,
        is_system: false
      })
      .returningAll()
      .executeTakeFirst();
  }

  return {
    updated_count: transactionIds.length,
    rule_created: rule
  };
}

export async function markTransactionPersonal(organizationId: string, transactionId: string) {
  const updated = await db
    .updateTable('bank_transactions')
    .set({ is_business: false, is_excluded: true })
    .where('organization_id', '=', organizationId)
    .where('id', '=', transactionId)
    .returning(['id', 'is_business', 'is_excluded'])
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Transaction not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function splitTransaction(organizationId: string, transactionId: string, splits: Array<Record<string, any>>) {
  const transaction = await db
    .selectFrom('bank_transactions')
    .select(['id', 'amount_cents'])
    .where('organization_id', '=', organizationId)
    .where('id', '=', transactionId)
    .executeTakeFirst();

  if (!transaction) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Transaction not found',
      statusCode: 404
    });
  }

  const totalSplit = splits.reduce((sum, split) => sum + Number(split.amount_cents ?? 0), 0);
  if (totalSplit !== Number(transaction.amount_cents)) {
    throw new ApiError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Split amounts must equal transaction total',
      statusCode: 400
    });
  }

  await db.deleteFrom('transaction_splits').where('transaction_id', '=', transactionId).execute();

  const inserted = await db
    .insertInto('transaction_splits')
    .values(
      splits.map((split) => ({
        transaction_id: transactionId,
        category_id: split.category_id,
        amount_cents: split.amount_cents,
        description: split.description ?? null
      }))
    )
    .returningAll()
    .execute();

  await db
    .updateTable('bank_transactions')
    .set({ is_split: true })
    .where('id', '=', transactionId)
    .execute();

  return {
    id: transactionId,
    is_split: true,
    splits: inserted
  };
}

export async function linkTransactionReceipt(organizationId: string, transactionId: string, receiptId: string) {
  await db
    .updateTable('bank_transactions')
    .set({ receipt_id: receiptId })
    .where('organization_id', '=', organizationId)
    .where('id', '=', transactionId)
    .execute();

  await db
    .updateTable('receipts')
    .set({ status: 'matched', expense_id: null })
    .where('id', '=', receiptId)
    .execute();

  return {
    transaction: { id: transactionId, receipt_id: receiptId },
    receipt: { id: receiptId, status: 'matched' }
  };
}

export async function processTransactions(transactions: PlaidTransaction[], bankAccount: any) {
  const results = {
    processed: 0,
    duplicates: 0,
    categorized: 0,
    needs_review: 0
  };

  for (const txn of transactions) {
    const existing = await db
      .selectFrom('bank_transactions')
      .select(['id'])
      .where('organization_id', '=', bankAccount.organization_id)
      .where('plaid_transaction_id', '=', txn.transaction_id)
      .executeTakeFirst();

    if (existing) {
      await db
        .updateTable('bank_transactions')
        .set({
          name: txn.name,
          merchant_name: txn.merchant_name ?? null,
          amount_cents: Math.round(txn.amount * 100),
          date: txn.date,
          authorized_date: txn.authorized_date ?? null,
          is_pending: txn.pending,
          plaid_last_modified: new Date().toISOString(),
          last_modified_at: new Date().toISOString()
        })
        .where('id', '=', existing.id)
        .execute();
      continue;
    }

    const manualDuplicate = await findManualExpenseDuplicate(bankAccount.organization_id, txn);

    const normalized = normalizeTransaction(txn, bankAccount);

    if (txn.merchant_name) {
      const vendor = await findOrCreateVendorFromMerchant(bankAccount.organization_id, txn.merchant_name);
      normalized.vendor_id = vendor?.id ?? null;
    }

    const categorization = await categorizeTransaction(normalized as any, bankAccount.organization_id);
    normalized.category_id = categorization.category_id ?? null;
    normalized.categorization_method = categorization.method ?? null;
    normalized.categorization_confidence = categorization.confidence;
    normalized.is_categorized = Boolean(categorization.category_id);

    if (manualDuplicate) {
      normalized.is_duplicate = true;
      normalized.duplicate_of_id = manualDuplicate.id;
      normalized.expense_id = manualDuplicate.id;
      normalized.is_expense_created = true;
      await db
        .updateTable('expenses')
        .set({ bank_transaction_id: normalized.id })
        .where('id', '=', manualDuplicate.id)
        .execute();
      results.duplicates += 1;
    }

    const transaction = await db
      .insertInto('bank_transactions')
      .values(normalized)
      .returningAll()
      .executeTakeFirst();

    if (transaction && normalized.is_categorized && !normalized.is_duplicate && normalized.is_business && normalized.amount_cents > 0) {
      const expense = await createExpenseFromTransaction(transaction, bankAccount.connected_by_user_id ?? null);
      if (expense?.id) {
        await db
          .updateTable('bank_transactions')
          .set({ expense_id: expense.id, is_expense_created: true })
          .where('id', '=', transaction.id)
          .execute();
      }
    }

    eventBus.publish('transaction.imported', {
      transaction_id: transaction?.id ?? '',
      organization_id: bankAccount.organization_id,
      amount_cents: normalized.amount_cents,
      needs_review: !normalized.is_categorized || categorization.confidence < 70
    });

    results.processed += 1;
    if (normalized.is_categorized) results.categorized += 1;
    if (!normalized.is_categorized || categorization.confidence < 70) results.needs_review += 1;
  }

  return results;
}

function normalizeTransaction(plaidTxn: PlaidTransaction, account: any): Record<string, any> {
  return {
    organization_id: account.organization_id,
    bank_account_id: account.id,
    plaid_transaction_id: plaidTxn.transaction_id,
    amount_cents: Math.round(plaidTxn.amount * 100),
    currency: plaidTxn.iso_currency_code || 'USD',
    date: plaidTxn.date,
    authorized_date: plaidTxn.authorized_date ?? null,
    name: plaidTxn.name,
    merchant_name: plaidTxn.merchant_name ?? null,
    original_description: plaidTxn.original_description ?? plaidTxn.name,
    transaction_type: plaidTxn.amount > 0 ? 'debit' : 'credit',
    is_pending: plaidTxn.pending,
    plaid_category: plaidTxn.category ?? null,
    plaid_category_id: plaidTxn.category_id ?? null,
    is_business: true,
    is_excluded: false,
    is_duplicate: false,
    is_expense_created: false,
    is_split: false,
    payment_channel: plaidTxn.payment_channel ?? null,
    location: plaidTxn.location ?? null,
    first_imported_at: new Date().toISOString(),
    last_modified_at: new Date().toISOString()
  };
}

async function findManualExpenseDuplicate(organizationId: string, txn: PlaidTransaction) {
  const date = new Date(txn.date);
  const start = new Date(date.getTime() - 3 * 86400000).toISOString().split('T')[0];
  const end = new Date(date.getTime() + 3 * 86400000).toISOString().split('T')[0];

  const expense = await db
    .selectFrom('expenses')
    .select(['id'])
    .where('organization_id', '=', organizationId)
    .where('is_from_bank', '=', false)
    .where('bank_transaction_id', 'is', null)
    .where('amount_cents', '=', Math.round(txn.amount * 100))
    .where('date', '>=', start)
    .where('date', '<=', end)
    .executeTakeFirst();

  return expense ?? null;
}

async function createExpenseFromTransaction(transaction: any, createdByUserId: string | null) {
  const expense = await db
    .insertInto('expenses')
    .values({
      organization_id: transaction.organization_id,
      description: transaction.name,
      amount_cents: transaction.amount_cents,
      currency: transaction.currency,
      date: transaction.date,
      category_id: transaction.category_id,
      vendor_id: transaction.vendor_id ?? null,
      vendor_name: transaction.merchant_name ?? null,
      payment_method: null,
      bank_transaction_id: transaction.id,
      is_from_bank: true,
      has_receipt: false,
      is_billable: false,
      is_billed: false,
      is_split: false,
      status: transaction.is_categorized ? 'categorized' : 'pending',
      notes: null,
      tags: [],
      is_tax_deductible: true,
      tax_category: null,
      created_by_user_id: createdByUserId ?? transaction.organization_id
    })
    .returningAll()
    .executeTakeFirst();

  if (expense) {
    eventBus.publish('expense.created', {
      expense_id: expense.id,
      organization_id: expense.organization_id,
      amount_cents: expense.amount_cents,
      currency: expense.currency,
      category_id: expense.category_id,
      date: expense.date,
      description: expense.description,
      is_billable: expense.is_billable,
      client_id: expense.client_id ?? undefined
    });
  }

  return expense;
}
