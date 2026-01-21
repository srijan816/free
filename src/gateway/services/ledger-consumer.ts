import { sql } from 'kysely';
import { db } from '../db/index.js';
import type { BaseEvent } from './event-bus.js';

function toDate(value?: string) {
  if (!value) return new Date().toISOString().split('T')[0];
  return value.split('T')[0];
}

function toAmount(value: any) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount) ? Math.round(amount) : 0;
}

async function upsertLedgerEntry(payload: {
  organization_id: string;
  date: string;
  type: 'income' | 'expense' | 'transfer' | 'adjustment';
  amount_cents: number;
  currency: string;
  category_id?: string | null;
  description?: string | null;
  source_type: 'invoice' | 'payment' | 'expense' | 'bank_transaction' | 'manual' | 'system';
  source_id: string;
  source_service?: string;
}) {
  await db
    .insertInto('ledger_entries')
    .values({
      organization_id: payload.organization_id,
      date: payload.date,
      type: payload.type,
      amount_cents: payload.amount_cents,
      currency: payload.currency,
      category_id: payload.category_id ?? null,
      description: payload.description ?? null,
      source_type: payload.source_type,
      source_id: payload.source_id,
      source_service: payload.source_service ?? null
    })
    .onConflict((oc) =>
      oc.columns(['source_type', 'source_id']).doUpdateSet({
        date: payload.date,
        type: payload.type,
        amount_cents: payload.amount_cents,
        currency: payload.currency,
        category_id: payload.category_id ?? null,
        description: payload.description ?? null,
        source_service: payload.source_service ?? null,
        updated_at: sql`NOW()`
      })
    )
    .execute();
}

export async function handlePaymentCompleted(event: BaseEvent) {
  const payload = event.payload || {};
  const sourceId = payload.payment_id || payload.invoice_id;
  if (!sourceId) return;
  await upsertLedgerEntry({
    organization_id: event.organization_id,
    date: toDate(payload.date || payload.paid_at || event.timestamp),
    type: 'income',
    amount_cents: toAmount(payload.amount_cents),
    currency: payload.currency || 'USD',
    category_id: null,
    description: payload.description || 'Payment received',
    source_type: 'payment',
    source_id: sourceId,
    source_service: event.source_service
  });
}

export async function handlePaymentRefunded(event: BaseEvent) {
  const payload = event.payload || {};
  const sourceId = payload.refund_id || payload.payment_id;
  if (!sourceId) return;
  await upsertLedgerEntry({
    organization_id: event.organization_id,
    date: toDate(payload.date || event.timestamp),
    type: 'expense',
    amount_cents: toAmount(payload.amount_cents),
    currency: payload.currency || 'USD',
    category_id: null,
    description: payload.description || 'Payment refund',
    source_type: 'payment',
    source_id: sourceId,
    source_service: event.source_service
  });
}

export async function handleExpenseCreated(event: BaseEvent) {
  const payload = event.payload || {};
  if (!payload.expense_id) return;
  await upsertLedgerEntry({
    organization_id: event.organization_id,
    date: toDate(payload.date || event.timestamp),
    type: 'expense',
    amount_cents: toAmount(payload.amount_cents),
    currency: payload.currency || 'USD',
    category_id: payload.category_id ?? null,
    description: payload.description || 'Expense recorded',
    source_type: 'expense',
    source_id: payload.expense_id,
    source_service: event.source_service
  });
}

export async function handleExpenseUpdated(event: BaseEvent) {
  const payload = event.payload || {};
  if (!payload.expense_id) return;
  await upsertLedgerEntry({
    organization_id: event.organization_id,
    date: toDate(payload.date || event.timestamp),
    type: 'expense',
    amount_cents: toAmount(payload.amount_cents),
    currency: payload.currency || 'USD',
    category_id: payload.category_id ?? null,
    description: payload.description || 'Expense updated',
    source_type: 'expense',
    source_id: payload.expense_id,
    source_service: event.source_service
  });
}

export async function handleExpenseDeleted(event: BaseEvent) {
  const payload = event.payload || {};
  if (!payload.expense_id) return;
  await db
    .deleteFrom('ledger_entries')
    .where('source_type', '=', 'expense')
    .where('source_id', '=', payload.expense_id)
    .execute();
}
