import { sql } from 'kysely';
import { db } from '../db/index.js';
import { storeFile } from '../integrations/storage.js';
import { ocrRouter } from '../integrations/ocr.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { ReceiptExtractedData } from '../utils/receipt-parser.js';
import { createExpense } from './expenses.js';
import { eventBus } from '../integrations/event-bus.js';

interface ListReceiptOptions {
  page: number;
  perPage: number;
  status?: string;
  unmatched?: boolean;
  date_from?: string;
  date_to?: string;
  sort?: string;
}

function tokenSimilarity(a: string, b: string) {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));
  if (!tokensA.size || !tokensB.size) return 0;
  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }
  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function calculateMatchConfidence(expense: any, extracted: ReceiptExtractedData) {
  let confidence = 0;
  const reasons: string[] = [];

  if (extracted.total_amount_cents && expense.amount_cents) {
    const diff = Math.abs(extracted.total_amount_cents - expense.amount_cents);
    const percentDiff = diff / expense.amount_cents;
    if (diff === 0) {
      confidence += 40;
      reasons.push('exact_amount_match');
    } else if (percentDiff < 0.01) {
      confidence += 35;
      reasons.push('amount_match');
    } else if (percentDiff < 0.05) {
      confidence += 20;
      reasons.push('close_amount');
    }
  }

  if (extracted.transaction_date && expense.date) {
    const daysDiff = Math.abs(
      (new Date(extracted.transaction_date).getTime() - new Date(expense.date).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysDiff === 0) {
      confidence += 30;
      reasons.push('exact_date_match');
    } else if (daysDiff <= 1) {
      confidence += 20;
      reasons.push('date_match');
    } else if (daysDiff <= 3) {
      confidence += 10;
      reasons.push('close_date');
    }
  }

  if (extracted.vendor_name && expense.vendor_name) {
    const similarity = tokenSimilarity(extracted.vendor_name.toLowerCase(), expense.vendor_name.toLowerCase());
    if (similarity > 0.8) {
      confidence += 30;
      reasons.push('vendor_match');
    } else if (similarity > 0.5) {
      confidence += 15;
      reasons.push('similar_vendor');
    }
  }

  return { confidence: Math.min(confidence, 100), reasons };
}

async function findExpenseMatches(organizationId: string, extracted: ReceiptExtractedData) {
  const now = new Date();
  const rangeStart = extracted.transaction_date
    ? new Date(new Date(extracted.transaction_date).getTime() - 3 * 86400000)
    : new Date(now.getTime() - 14 * 86400000);
  const rangeEnd = extracted.transaction_date
    ? new Date(new Date(extracted.transaction_date).getTime() + 3 * 86400000)
    : now;

  const amountRange = extracted.total_amount_cents
    ? {
        min: Math.round(extracted.total_amount_cents * 0.95),
        max: Math.round(extracted.total_amount_cents * 1.05)
      }
    : null;

  let query = db
    .selectFrom('expenses')
    .select(['id', 'description', 'amount_cents', 'date', 'vendor_name'])
    .where('organization_id', '=', organizationId)
    .where('has_receipt', '=', false)
    .where('date', '>=', rangeStart.toISOString().split('T')[0])
    .where('date', '<=', rangeEnd.toISOString().split('T')[0]);

  if (amountRange) {
    query = query.where('amount_cents', '>=', amountRange.min).where('amount_cents', '<=', amountRange.max);
  }

  const expenses = await query.execute();

  const candidates = expenses
    .map((expense) => {
      const { confidence, reasons } = calculateMatchConfidence(expense, extracted);
      return {
        expense_id: expense.id,
        expense_description: expense.description,
        expense_amount_cents: expense.amount_cents,
        expense_date: expense.date,
        confidence,
        match_reasons: reasons
      };
    })
    .filter((candidate) => candidate.confidence >= 50)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);

  return candidates;
}

export async function createReceipt(organizationId: string, userId: string, payload: {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  source?: string;
  expense_id?: string;
}) {
  const stored = await storeFile({
    organizationId,
    type: 'receipts',
    fileName: payload.fileName,
    mimeType: payload.mimeType,
    buffer: payload.buffer
  });

  const duplicate = await db
    .selectFrom('receipts')
    .select(['id'])
    .where('organization_id', '=', organizationId)
    .where('file_hash', '=', stored.hash)
    .executeTakeFirst();

  const receipt = await db
    .insertInto('receipts')
    .values({
      organization_id: organizationId,
      file_name: stored.fileName,
      file_url: stored.fileUrl,
      file_size_bytes: stored.size,
      mime_type: stored.mimeType,
      status: 'uploaded',
      source: payload.source ?? 'upload',
      file_hash: stored.hash,
      is_duplicate: Boolean(duplicate),
      duplicate_of_id: duplicate?.id ?? null,
      expense_id: payload.expense_id ?? null,
      uploaded_by_user_id: userId
    })
    .returningAll()
    .executeTakeFirst();

  if (!receipt) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create receipt',
      statusCode: 500
    });
  }

  eventBus.publish('receipt.uploaded', {
    receipt_id: receipt.id,
    organization_id: organizationId,
    file_name: receipt.file_name
  });

  await processReceipt(receipt.id);

  return receipt;
}

export async function processReceipt(receiptId: string) {
  const receipt = await db
    .selectFrom('receipts')
    .selectAll()
    .where('id', '=', receiptId)
    .executeTakeFirst();

  if (!receipt) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Receipt not found',
      statusCode: 404
    });
  }

  try {
    await db
      .updateTable('receipts')
      .set({
        status: 'processing',
        processing_started_at: new Date().toISOString()
      })
      .where('id', '=', receiptId)
      .execute();

    const routed = await ocrRouter.extract(receipt.file_url);
    const extracted = routed.extracted;
    const extractedWithMeta = {
      ...extracted,
      ocr_provider: routed.provider,
      ocr_blocks: routed.ocr.blocks
    };

    const suggestions = await findExpenseMatches(receipt.organization_id, extracted);

    await db
      .updateTable('receipts')
      .set({
        status: 'processed',
        processing_completed_at: new Date().toISOString(),
        ocr_raw_text: routed.ocr.text,
        ocr_confidence: routed.ocr.confidence,
        extracted_data: extractedWithMeta as any,
        match_suggestions: suggestions as any
      })
      .where('id', '=', receiptId)
      .execute();

    if (suggestions.length && suggestions[0].confidence >= 90) {
      await matchReceiptToExpense(receipt.organization_id, receiptId, suggestions[0].expense_id);
    }

    eventBus.publish('receipt.processed', {
      receipt_id: receiptId,
      organization_id: receipt.organization_id,
      extracted_data: extractedWithMeta,
      ocr_provider: routed.provider,
      has_matches: suggestions.length > 0
    });
  } catch (error: any) {
    await db
      .updateTable('receipts')
      .set({
        status: 'failed',
        processing_error: error?.message ?? 'Receipt processing failed'
      })
      .where('id', '=', receiptId)
      .execute();

    throw error;
  }
}

export async function listReceipts(organizationId: string, options: ListReceiptOptions) {
  let query = db
    .selectFrom('receipts')
    .selectAll()
    .where('organization_id', '=', organizationId);

  if (options.status) {
    query = query.where('status', '=', options.status as any);
  }

  if (options.unmatched) {
    query = query.where('expense_id', 'is', null).where('status', '=', 'processed');
  }

  if (options.date_from) {
    query = query.where('uploaded_at', '>=', options.date_from);
  }

  if (options.date_to) {
    query = query.where('uploaded_at', '<=', options.date_to);
  }

  const countRow = await query
    .select((eb) => eb.fn.count('id').as('total'))
    .executeTakeFirst();
  const total = Number(countRow?.total ?? 0);

  const sortMap: Record<string, string> = {
    uploaded_at: 'uploaded_at',
    extracted_date: 'processing_completed_at',
    match_confidence: 'match_confidence'
  };
  const sortKey = options.sort?.replace('-', '') ?? 'uploaded_at';
  const sortColumn = sortMap[sortKey] ?? 'uploaded_at';
  const sortDirection = options.sort?.startsWith('-') ? 'desc' : 'asc';

  const data = await query
    .orderBy(sortColumn as never, sortDirection as never)
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage)
    .execute();

  const summaryRow = await db
    .selectFrom('receipts')
    .select([
      sql<number>`sum(CASE WHEN expense_id IS NULL AND status = 'processed' THEN 1 ELSE 0 END)`.as('total_unmatched'),
      sql<number>`sum(CASE WHEN status = 'processing' THEN 1 ELSE 0 END)`.as('total_processing'),
      sql<number>`sum(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)`.as('total_failed')
    ])
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  return {
    data,
    total,
    summary: {
      total_unmatched: Number(summaryRow?.total_unmatched ?? 0),
      total_processing: Number(summaryRow?.total_processing ?? 0),
      total_failed: Number(summaryRow?.total_failed ?? 0)
    }
  };
}

export async function getReceipt(organizationId: string, receiptId: string) {
  const receipt = await db
    .selectFrom('receipts')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', receiptId)
    .executeTakeFirst();

  if (!receipt) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Receipt not found',
      statusCode: 404
    });
  }

  return receipt;
}

export async function matchReceiptToExpense(organizationId: string, receiptId: string, expenseId: string) {
  const receipt = await db
    .selectFrom('receipts')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', receiptId)
    .executeTakeFirst();

  if (!receipt) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Receipt not found',
      statusCode: 404
    });
  }

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

  await db
    .updateTable('receipts')
    .set({ status: 'matched', expense_id: expenseId })
    .where('id', '=', receiptId)
    .execute();

  await db
    .updateTable('expenses')
    .set({ has_receipt: true, receipt_id: receiptId })
    .where('id', '=', expenseId)
    .execute();

  eventBus.publish('receipt.matched', {
    receipt_id: receiptId,
    expense_id: expenseId,
    organization_id: organizationId
  });

  if (expense.is_billable && receipt.file_url) {
    eventBus.publish('expense.billable_receipt_ready', {
      organization_id: organizationId,
      expense_id: expenseId,
      client_id: expense.client_id ?? null,
      invoice_id: expense.invoice_id ?? null,
      file_key: receipt.file_url,
      file_url: receipt.file_url,
      file_name: receipt.file_name,
      mime_type: receipt.mime_type,
      file_size_bytes: receipt.file_size_bytes
    });
  }

  return {
    receipt: { id: receiptId, status: 'matched', expense_id: expenseId },
    expense: { id: expenseId, has_receipt: true, receipt_id: receiptId }
  };
}

export async function createExpenseFromReceipt(organizationId: string, userId: string, receiptId: string, overrides: Record<string, any>) {
  const receipt = await getReceipt(organizationId, receiptId);
  const extracted = (receipt.extracted_data || {}) as ReceiptExtractedData;

  const expense = await createExpense(organizationId, userId, {
    description: overrides.description ?? extracted.vendor_name ?? 'Receipt expense',
    amount_cents: overrides.amount_cents ?? extracted.total_amount_cents,
    date: overrides.date ?? extracted.transaction_date ?? new Date().toISOString().split('T')[0],
    category_id: overrides.category_id,
    vendor_id: overrides.vendor_id,
    receipt_id: receiptId,
    is_from_bank: false
  });

  await matchReceiptToExpense(organizationId, receiptId, expense.id);

  return {
    expense,
    receipt: { id: receiptId, status: 'matched', expense_id: expense.id }
  };
}

export async function deleteReceipt(organizationId: string, receiptId: string) {
  await db
    .deleteFrom('receipts')
    .where('organization_id', '=', organizationId)
    .where('id', '=', receiptId)
    .execute();

  return { id: receiptId, deleted: true };
}
