import { sql } from 'kysely';
import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { eventBus } from '../integrations/event-bus.js';

interface ListExpenseOptions {
  page: number;
  perPage: number;
  date_from?: string;
  date_to?: string;
  category_id?: string;
  vendor_id?: string;
  status?: string;
  is_billable?: boolean;
  is_billed?: boolean;
  client_id?: string;
  has_receipt?: boolean;
  is_from_bank?: boolean;
  min_amount?: number;
  max_amount?: number;
  search?: string;
  tags?: string[];
  sort?: string;
  include_deleted?: boolean;
}

async function getExpenseCategory(organizationId: string, categoryId: string) {
  const category = await db
    .selectFrom('categories')
    .select(['id', 'name', 'tax_category', 'is_tax_deductible'])
    .where('id', '=', categoryId)
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  if (!category) {
    throw new ApiError({
      code: ERROR_CODES.CATEGORY_NOT_FOUND,
      message: 'Category not found',
      statusCode: 404
    });
  }

  return category as any;
}

async function findOrCreateVendor(organizationId: string, vendorId?: string | null, vendorName?: string | null) {
  if (vendorId) {
    const vendor = await db
      .selectFrom('vendors')
      .select(['id', 'name', 'display_name'])
      .where('organization_id', '=', organizationId)
      .where('id', '=', vendorId)
      .executeTakeFirst();
    if (!vendor) {
      throw new ApiError({
        code: ERROR_CODES.NOT_FOUND,
        message: 'Vendor not found',
        statusCode: 404
      });
    }
    return vendor as any;
  }

  if (vendorName) {
    const existing = await db
      .selectFrom('vendors')
      .select(['id', 'name', 'display_name'])
      .where('organization_id', '=', organizationId)
      .where('name', '=', vendorName)
      .executeTakeFirst();

    if (existing) return existing as any;

    const created = await db
      .insertInto('vendors')
      .values({
        organization_id: organizationId,
        name: vendorName,
        display_name: vendorName
      })
      .returning(['id', 'name', 'display_name'])
      .executeTakeFirst();

    if (created) {
      eventBus.publish('vendor.created', {
        vendor_id: created.id,
        organization_id: organizationId,
        name: created.name,
        source: 'manual'
      });
    }

    return created as any;
  }

  return null;
}

export async function listExpenses(organizationId: string, options: ListExpenseOptions) {
  let query = db
    .selectFrom('expenses')
    .leftJoin('vendors', 'vendors.id', 'expenses.vendor_id')
    .leftJoin('categories', 'categories.id', 'expenses.category_id')
    .select([
      'expenses.id',
      'expenses.description',
      'expenses.amount_cents',
      'expenses.currency',
      'expenses.date',
      'expenses.payment_method',
      'expenses.is_from_bank',
      'expenses.has_receipt',
      'expenses.is_billable',
      'expenses.is_tax_deductible',
      'expenses.status',
      'expenses.tags',
      'expenses.created_at',
      sql`json_build_object('id', categories.id, 'name', categories.name, 'tax_category', categories.tax_category)`.as('category'),
      sql`json_build_object('id', vendors.id, 'name', vendors.name, 'display_name', vendors.display_name)`.as('vendor')
    ])
    .where('expenses.organization_id', '=', organizationId);

  if (!options.include_deleted) {
    query = query.where('expenses.deleted_at', 'is', null);
  }

  if (options.date_from) {
    query = query.where('expenses.date', '>=', options.date_from);
  }

  if (options.date_to) {
    query = query.where('expenses.date', '<=', options.date_to);
  }

  if (options.category_id) {
    query = query.where('expenses.category_id', '=', options.category_id);
  }

  if (options.vendor_id) {
    query = query.where('expenses.vendor_id', '=', options.vendor_id);
  }

  if (options.status) {
    query = query.where('expenses.status', '=', options.status as any);
  }

  if (options.is_billable != null) {
    query = query.where('expenses.is_billable', '=', options.is_billable);
  }

  if (options.is_billed != null) {
    query = query.where('expenses.is_billed', '=', options.is_billed);
  }

  if (options.client_id) {
    query = query.where('expenses.client_id', '=', options.client_id);
  }

  if (options.has_receipt != null) {
    query = query.where('expenses.has_receipt', '=', options.has_receipt);
  }

  if (options.is_from_bank != null) {
    query = query.where('expenses.is_from_bank', '=', options.is_from_bank);
  }

  if (options.min_amount != null) {
    query = query.where('expenses.amount_cents', '>=', options.min_amount);
  }

  if (options.max_amount != null) {
    query = query.where('expenses.amount_cents', '<=', options.max_amount);
  }

  if (options.search) {
    const search = `%${options.search.toLowerCase()}%`;
    query = query.where((eb) =>
      eb.or([
        eb('expenses.description', 'ilike', search),
        eb('expenses.vendor_name', 'ilike', search),
        eb('expenses.notes', 'ilike', search)
      ])
    );
  }

  if (options.tags?.length) {
    query = query.where(sql`expenses.tags && ARRAY[${sql.join(options.tags)}]` as any);
  }

  const countRow = await query
    .select((eb) => eb.fn.count('expenses.id').as('total'))
    .executeTakeFirst();
  const total = Number(countRow?.total ?? 0);

  const sortMap: Record<string, string> = {
    date: 'expenses.date',
    amount_cents: 'expenses.amount_cents',
    created_at: 'expenses.created_at'
  };
  const sortKey = options.sort?.replace('-', '') ?? 'date';
  const sortColumn = sortMap[sortKey] ?? 'expenses.date';
  const sortDirection = options.sort?.startsWith('-') ? 'desc' : 'asc';

  const data = await query
    .orderBy(sortColumn as never, sortDirection as never)
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage)
    .execute();

  const summaryRow = await db
    .selectFrom('expenses')
    .select((eb) => [
      eb.fn.coalesce(eb.fn.sum('amount_cents'), eb.val(0)).as('total_amount_cents'),
      eb.fn.coalesce(
        eb.fn.sum(sql<number>`CASE WHEN has_receipt = false THEN 1 ELSE 0 END`),
        eb.val(0)
      ).as('count_needs_receipt'),
      eb.fn.coalesce(
        eb.fn.sum(sql<number>`CASE WHEN status = 'pending' THEN 1 ELSE 0 END`),
        eb.val(0)
      ).as('count_uncategorized')
    ])
    .where('organization_id', '=', organizationId)
    .where('deleted_at', 'is', null)
    .executeTakeFirst();

  const countsByCategory = await db
    .selectFrom('expenses')
    .innerJoin('categories', 'categories.id', 'expenses.category_id')
    .select([
      'expenses.category_id',
      'categories.name',
      sql<number>`count(*)`.as('count'),
      sql<number>`sum(expenses.amount_cents)`.as('amount_cents')
    ])
    .where('expenses.organization_id', '=', organizationId)
    .where('expenses.deleted_at', 'is', null)
    .groupBy(['expenses.category_id', 'categories.name'])
    .execute();

  const countByCategory = countsByCategory.reduce<Record<string, any>>((acc, row: any) => {
    acc[row.category_id] = {
      name: row.name,
      count: Number(row.count ?? 0),
      amount_cents: Number(row.amount_cents ?? 0)
    };
    return acc;
  }, {});

  return {
    data,
    total,
    summary: {
      total_amount_cents: Number(summaryRow?.total_amount_cents ?? 0),
      count_by_category: countByCategory,
      count_needs_receipt: Number(summaryRow?.count_needs_receipt ?? 0),
      count_uncategorized: Number(summaryRow?.count_uncategorized ?? 0)
    }
  };
}

export async function createExpense(organizationId: string, userId: string, payload: Record<string, any>) {
  if (payload.is_billable && !payload.client_id) {
    throw new ApiError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Client is required for billable expenses',
      statusCode: 400
    });
  }

  const category = await getExpenseCategory(organizationId, payload.category_id);
  const vendor = await findOrCreateVendor(organizationId, payload.vendor_id, payload.vendor_name);

  const inserted = await db
    .insertInto('expenses')
    .values({
      organization_id: organizationId,
      description: payload.description,
      amount_cents: payload.amount_cents,
      currency: payload.currency ?? 'USD',
      date: payload.date,
      category_id: payload.category_id,
      vendor_id: vendor?.id ?? null,
      vendor_name: vendor?.display_name || vendor?.name || payload.vendor_name || null,
      payment_method: payload.payment_method ?? null,
      is_from_bank: payload.is_from_bank ?? false,
      bank_transaction_id: payload.bank_transaction_id ?? null,
      receipt_id: payload.receipt_id ?? null,
      has_receipt: Boolean(payload.receipt_id),
      is_billable: payload.is_billable ?? false,
      client_id: payload.client_id ?? null,
      is_billed: false,
      is_split: false,
      status: 'categorized',
      notes: payload.notes ?? null,
      tags: payload.tags ?? [],
      recurring_expense_id: payload.recurring_expense_id ?? null,
      is_tax_deductible: payload.is_tax_deductible ?? (category as any).is_tax_deductible ?? true,
      tax_category: payload.tax_category ?? category.tax_category ?? null,
      created_by_user_id: userId
    })
    .returningAll()
    .executeTakeFirst();

  if (!inserted) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create expense',
      statusCode: 500
    });
  }

  if (payload.receipt_id) {
    await db
      .updateTable('receipts')
      .set({
        expense_id: inserted.id,
        status: 'matched'
      })
      .where('id', '=', payload.receipt_id)
      .execute();
  }

  eventBus.publish('expense.created', {
    expense_id: inserted.id,
    organization_id: organizationId,
    amount_cents: inserted.amount_cents,
    currency: inserted.currency,
    category_id: inserted.category_id,
    date: inserted.date,
    description: inserted.description,
    is_billable: inserted.is_billable,
    client_id: inserted.client_id ?? undefined
  });

  if (inserted.is_billable && inserted.receipt_id) {
    const receipt = await db
      .selectFrom('receipts')
      .select(['file_url', 'file_name', 'mime_type', 'file_size_bytes'])
      .where('id', '=', inserted.receipt_id)
      .executeTakeFirst();

    if (receipt?.file_url) {
      eventBus.publish('expense.billable_receipt_ready', {
        organization_id: organizationId,
        expense_id: inserted.id,
        client_id: inserted.client_id ?? null,
        invoice_id: inserted.invoice_id ?? null,
        file_key: receipt.file_url,
        file_url: receipt.file_url,
        file_name: receipt.file_name,
        mime_type: receipt.mime_type,
        file_size_bytes: receipt.file_size_bytes
      });
    }
  }

  return inserted;
}

export async function getExpense(organizationId: string, expenseId: string, options: {
  includeAttachments?: boolean;
  includeReceipt?: boolean;
  includeSplits?: boolean;
  includeBankTransaction?: boolean;
}) {
  const expense = await db
    .selectFrom('expenses')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', expenseId)
    .executeTakeFirst();

  if (!expense) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Expense not found',
      statusCode: 404
    });
  }

  const category = await db
    .selectFrom('categories')
    .select(['id', 'name', 'tax_category'])
    .where('id', '=', expense.category_id)
    .executeTakeFirst();

  const vendor = expense.vendor_id
    ? await db.selectFrom('vendors').select(['id', 'name', 'display_name', 'default_category_id']).where('id', '=', expense.vendor_id).executeTakeFirst()
    : null;

  const result: Record<string, any> = {
    ...expense,
    category,
    vendor
  };

  if (options.includeAttachments) {
    result.attachments = await db
      .selectFrom('expense_attachments')
      .selectAll()
      .where('expense_id', '=', expenseId)
      .execute();
  }

  if (options.includeReceipt && expense.receipt_id) {
    result.receipt = await db
      .selectFrom('receipts')
      .selectAll()
      .where('id', '=', expense.receipt_id)
      .executeTakeFirst();
  }

  if (options.includeSplits) {
    result.splits = await db
      .selectFrom('expense_splits')
      .selectAll()
      .where('expense_id', '=', expenseId)
      .execute();
  }

  if (options.includeBankTransaction && expense.bank_transaction_id) {
    result.bank_transaction = await db
      .selectFrom('bank_transactions')
      .selectAll()
      .where('id', '=', expense.bank_transaction_id)
      .executeTakeFirst();
  }

  return result;
}

export async function updateExpense(organizationId: string, expenseId: string, updates: Record<string, any>) {
  const existing = await db
    .selectFrom('expenses')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', expenseId)
    .executeTakeFirst();

  if (!existing) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Expense not found',
      statusCode: 404
    });
  }

  if (existing.is_from_bank && (updates.amount_cents || updates.currency)) {
    updates.original_amount_cents = existing.original_amount_cents ?? existing.amount_cents;
    updates.original_currency = existing.original_currency ?? existing.currency;
  }

  if (updates.is_billable && !updates.client_id && !existing.client_id) {
    throw new ApiError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Client is required for billable expenses',
      statusCode: 400
    });
  }

  if (updates.category_id) {
    await getExpenseCategory(organizationId, updates.category_id);
  }

  const updated = await db
    .updateTable('expenses')
    .set({
      description: updates.description,
      amount_cents: updates.amount_cents,
      currency: updates.currency,
      date: updates.date,
      category_id: updates.category_id,
      vendor_id: updates.vendor_id,
      payment_method: updates.payment_method,
      is_billable: updates.is_billable,
      client_id: updates.client_id,
      notes: updates.notes,
      tags: updates.tags,
      is_tax_deductible: updates.is_tax_deductible,
      original_amount_cents: updates.original_amount_cents,
      original_currency: updates.original_currency
    })
    .where('organization_id', '=', organizationId)
    .where('id', '=', expenseId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to update expense',
      statusCode: 500
    });
  }

  eventBus.publish('expense.updated', {
    expense_id: updated.id,
    organization_id: organizationId,
    amount_cents: updated.amount_cents,
    currency: updated.currency,
    category_id: updated.category_id,
    date: updated.date,
    description: updated.description,
    is_billable: updated.is_billable,
    client_id: updated.client_id ?? undefined,
    receipt_id: updated.receipt_id ?? undefined,
    invoice_id: updated.invoice_id ?? undefined
  });

  if (updated.is_billable && updated.receipt_id) {
    const receipt = await db
      .selectFrom('receipts')
      .select(['file_url', 'file_name', 'mime_type', 'file_size_bytes'])
      .where('id', '=', updated.receipt_id)
      .executeTakeFirst();

    if (receipt?.file_url) {
      eventBus.publish('expense.billable_receipt_ready', {
        organization_id: organizationId,
        expense_id: updated.id,
        client_id: updated.client_id ?? null,
        invoice_id: updated.invoice_id ?? null,
        file_key: receipt.file_url,
        file_url: receipt.file_url,
        file_name: receipt.file_name,
        mime_type: receipt.mime_type,
        file_size_bytes: receipt.file_size_bytes
      });
    }
  }

  return updated;
}

export async function deleteExpense(organizationId: string, expenseId: string, options: { permanent?: boolean }) {
  const expense = await db
    .selectFrom('expenses')
    .select(['id', 'invoice_id'])
    .where('organization_id', '=', organizationId)
    .where('id', '=', expenseId)
    .executeTakeFirst();

  if (!expense) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Expense not found',
      statusCode: 404
    });
  }

  if (expense.invoice_id) {
    throw new ApiError({
      code: ERROR_CODES.CONFLICT,
      message: 'Cannot delete expense that has been billed to a client',
      statusCode: 409
    });
  }

  if (options.permanent) {
    await db.deleteFrom('expenses').where('id', '=', expenseId).execute();
    eventBus.publish('expense.deleted', {
      expense_id: expenseId,
      organization_id: organizationId,
      deleted_at: new Date().toISOString(),
      permanent: true
    });
    return { id: expenseId, deleted: true, deleted_at: new Date().toISOString() };
  }

  const updated = await db
    .updateTable('expenses')
    .set({ deleted_at: new Date().toISOString() })
    .where('id', '=', expenseId)
    .returning(['id', 'deleted_at'])
    .executeTakeFirst();

  eventBus.publish('expense.deleted', {
    expense_id: expenseId,
    organization_id: organizationId,
    deleted_at: updated?.deleted_at ?? new Date().toISOString()
  });

  return { id: updated?.id ?? expenseId, deleted: true, deleted_at: updated?.deleted_at };
}

export async function restoreExpense(organizationId: string, expenseId: string) {
  const updated = await db
    .updateTable('expenses')
    .set({ deleted_at: null })
    .where('organization_id', '=', organizationId)
    .where('id', '=', expenseId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Expense not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function splitExpense(organizationId: string, expenseId: string, splits: Array<Record<string, any>>) {
  const expense = await db
    .selectFrom('expenses')
    .select(['id', 'amount_cents'])
    .where('organization_id', '=', organizationId)
    .where('id', '=', expenseId)
    .executeTakeFirst();

  if (!expense) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Expense not found',
      statusCode: 404
    });
  }

  const totalSplit = splits.reduce((sum, split) => sum + Number(split.amount_cents ?? 0), 0);
  if (totalSplit !== Number(expense.amount_cents)) {
    throw new ApiError({
      code: ERROR_CODES.VALIDATION_ERROR,
      message: 'Split amounts must equal expense total',
      statusCode: 400,
      details: {
        expense_total: Number(expense.amount_cents),
        splits_total: totalSplit
      }
    });
  }

  await db.deleteFrom('expense_splits').where('expense_id', '=', expenseId).execute();

  const inserted = await db
    .insertInto('expense_splits')
    .values(
      splits.map((split) => ({
        expense_id: expenseId,
        category_id: split.category_id,
        amount_cents: split.amount_cents,
        description: split.description ?? null
      }))
    )
    .returningAll()
    .execute();

  await db
    .updateTable('expenses')
    .set({ is_split: true })
    .where('id', '=', expenseId)
    .execute();

  return {
    id: expenseId,
    is_split: true,
    splits: inserted
  };
}

export async function bulkUpdateExpenses(organizationId: string, expenseIds: string[], updates: Record<string, any>) {
  const expenses = await db
    .selectFrom('expenses')
    .select(['id', 'tags'])
    .where('organization_id', '=', organizationId)
    .where('id', 'in', expenseIds as any)
    .execute();

  const updatedIds: string[] = [];

  for (const expense of expenses) {
    let tags = updates.tags ?? expense.tags ?? [];
    if (updates.add_tags) {
      tags = Array.from(new Set([...(tags ?? []), ...updates.add_tags]));
    }
    if (updates.remove_tags) {
      tags = (tags ?? []).filter((tag: string) => !updates.remove_tags.includes(tag));
    }

    await db
      .updateTable('expenses')
      .set({
        category_id: updates.category_id,
        is_billable: updates.is_billable,
        tags
      })
      .where('id', '=', expense.id)
      .execute();

    updatedIds.push(expense.id);
  }

  return {
    updated_count: updatedIds.length,
    updated_ids: updatedIds,
    failed: [] as any[]
  };
}

export async function exportExpenses(organizationId: string, options: { date_from: string; date_to: string; include_receipts?: boolean }) {
  const expenses = await db
    .selectFrom('expenses')
    .leftJoin('categories', 'categories.id', 'expenses.category_id')
    .leftJoin('vendors', 'vendors.id', 'expenses.vendor_id')
    .select([
      'expenses.date',
      'expenses.description',
      'expenses.amount_cents',
      'expenses.currency',
      'categories.name as category_name',
      'vendors.name as vendor_name',
      'expenses.payment_method',
      'expenses.notes',
      'expenses.tags',
      'expenses.receipt_id'
    ])
    .where('expenses.organization_id', '=', organizationId)
    .where('expenses.date', '>=', options.date_from)
    .where('expenses.date', '<=', options.date_to)
    .execute();

  const header = [
    'Date',
    'Description',
    'Amount',
    'Currency',
    'Category',
    'Vendor',
    'Payment Method',
    'Receipt',
    'Notes',
    'Tags'
  ];

  const rows = [header.join(',')];

  for (const expense of expenses as any[]) {
    const receiptUrl = options.include_receipts && expense.receipt_id
      ? await db.selectFrom('receipts').select(['file_url']).where('id', '=', expense.receipt_id).executeTakeFirst()
      : null;

    rows.push([
      expense.date,
      `"${String(expense.description ?? '').replace(/"/g, '""')}"`,
      (expense.amount_cents / 100).toFixed(2),
      expense.currency,
      `"${String(expense.category_name ?? '').replace(/"/g, '""')}"`,
      `"${String(expense.vendor_name ?? '').replace(/"/g, '""')}"`,
      expense.payment_method ?? '',
      receiptUrl?.file_url ?? '',
      `"${String(expense.notes ?? '').replace(/"/g, '""')}"`,
      `"${(expense.tags ?? []).join('|')}"`
    ].join(','));
  }

  return rows.join('\n');
}

export async function listBillableExpenses(organizationId: string, options: { page: number; perPage: number; client_id?: string; date_from?: string; date_to?: string }) {
  let query = db
    .selectFrom('expenses')
    .innerJoin('categories', 'categories.id', 'expenses.category_id')
    .select([
      'expenses.id',
      'expenses.description',
      'expenses.amount_cents',
      'expenses.date',
      'expenses.client_id',
      'expenses.is_billed',
      sql`json_build_object('id', categories.id, 'name', categories.name)`.as('category')
    ])
    .where('expenses.organization_id', '=', organizationId)
    .where('expenses.is_billable', '=', true)
    .where('expenses.is_billed', '=', false);

  if (options.client_id) {
    query = query.where('expenses.client_id', '=', options.client_id);
  }

  if (options.date_from) {
    query = query.where('expenses.date', '>=', options.date_from);
  }

  if (options.date_to) {
    query = query.where('expenses.date', '<=', options.date_to);
  }

  const countRow = await query
    .select((eb) => eb.fn.count('expenses.id').as('total'))
    .executeTakeFirst();
  const total = Number(countRow?.total ?? 0);

  const data = await query
    .orderBy('expenses.date', 'desc')
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage)
    .execute();

  const summaryRows = await db
    .selectFrom('expenses')
    .select([
      'client_id',
      sql<number>`sum(amount_cents)`.as('amount_cents')
    ])
    .where('organization_id', '=', organizationId)
    .where('is_billable', '=', true)
    .where('is_billed', '=', false)
    .groupBy('client_id')
    .execute();

  const summary = summaryRows.reduce<Record<string, any>>((acc, row: any) => {
    if (!row.client_id) return acc;
    acc[row.client_id] = {
      name: row.client_id,
      amount_cents: Number(row.amount_cents ?? 0)
    };
    return acc;
  }, {});

  return {
    data,
    total,
    summary: {
      total_unbilled_cents: summaryRows.reduce((sum, row: any) => sum + Number(row.amount_cents ?? 0), 0),
      by_client: summary
    }
  };
}
