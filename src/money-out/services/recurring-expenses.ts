import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { calculateNextOccurrenceDate, formatDateOnly } from '../utils/recurrence.js';
import { createExpense } from './expenses.js';
import { eventBus } from '../integrations/event-bus.js';

interface ListRecurringOptions {
  status?: string;
  category_id?: string;
  vendor_id?: string;
}

export async function listRecurringExpenses(organizationId: string, options: ListRecurringOptions) {
  let query = db
    .selectFrom('recurring_expenses')
    .leftJoin('categories', 'categories.id', 'recurring_expenses.category_id')
    .leftJoin('vendors', 'vendors.id', 'recurring_expenses.vendor_id')
    .select([
      'recurring_expenses.id',
      'recurring_expenses.description',
      'recurring_expenses.amount_cents',
      'recurring_expenses.currency',
      'recurring_expenses.frequency',
      'recurring_expenses.frequency_interval',
      'recurring_expenses.next_occurrence_date',
      'recurring_expenses.status',
      'recurring_expenses.total_generated_count',
      'recurring_expenses.total_spent_cents',
      'recurring_expenses.vendor_id',
      'recurring_expenses.category_id',
      'categories.name as category_name',
      'vendors.name as vendor_name'
    ])
    .where('recurring_expenses.organization_id', '=', organizationId);

  if (options.status) {
    query = query.where('recurring_expenses.status', '=', options.status as any);
  }

  if (options.category_id) {
    query = query.where('recurring_expenses.category_id', '=', options.category_id);
  }

  if (options.vendor_id) {
    query = query.where('recurring_expenses.vendor_id', '=', options.vendor_id);
  }

  const data = await query.execute();

  const summaryRow = await db
    .selectFrom('recurring_expenses')
    .select((eb) => [
      eb.fn.coalesce(eb.fn.sum('amount_cents'), eb.val(0)).as('monthly_total_cents')
    ])
    .where('organization_id', '=', organizationId)
    .where('status', '=', 'active')
    .executeTakeFirst();

  return {
    data,
    summary: {
      monthly_total_cents: Number(summaryRow?.monthly_total_cents ?? 0),
      yearly_projection_cents: Number(summaryRow?.monthly_total_cents ?? 0) * 12
    }
  };
}

export async function createRecurringExpense(organizationId: string, userId: string, payload: Record<string, any>) {
  const inserted = await db
    .insertInto('recurring_expenses')
    .values({
      organization_id: organizationId,
      description: payload.description,
      amount_cents: payload.amount_cents,
      currency: payload.currency ?? 'USD',
      category_id: payload.category_id,
      vendor_id: payload.vendor_id ?? null,
      payment_method: payload.payment_method ?? null,
      frequency: payload.frequency,
      frequency_interval: payload.frequency_interval ?? 1,
      custom_days: payload.custom_days ?? null,
      start_date: payload.start_date,
      end_date: payload.end_date ?? null,
      next_occurrence_date: payload.start_date,
      billing_day: payload.billing_day ?? null,
      billing_weekday: payload.billing_weekday ?? null,
      status: 'active',
      notify_before_days: payload.notify_before_days ?? null,
      notes: payload.notes ?? null,
      created_by_user_id: userId
    })
    .returningAll()
    .executeTakeFirst();

  return inserted;
}

export async function updateRecurringExpense(organizationId: string, recurringId: string, updates: Record<string, any>) {
  const updated = await db
    .updateTable('recurring_expenses')
    .set({
      description: updates.description,
      amount_cents: updates.amount_cents,
      currency: updates.currency,
      category_id: updates.category_id,
      vendor_id: updates.vendor_id,
      payment_method: updates.payment_method,
      frequency: updates.frequency,
      frequency_interval: updates.frequency_interval,
      custom_days: updates.custom_days,
      end_date: updates.end_date,
      billing_day: updates.billing_day,
      billing_weekday: updates.billing_weekday,
      notify_before_days: updates.notify_before_days,
      notes: updates.notes
    })
    .where('organization_id', '=', organizationId)
    .where('id', '=', recurringId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Recurring expense not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function pauseRecurringExpense(organizationId: string, recurringId: string) {
  const updated = await db
    .updateTable('recurring_expenses')
    .set({ status: 'paused' })
    .where('organization_id', '=', organizationId)
    .where('id', '=', recurringId)
    .returning(['id', 'status'])
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Recurring expense not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function resumeRecurringExpense(organizationId: string, recurringId: string, nextDate?: string) {
  const recurring = await db
    .selectFrom('recurring_expenses')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', recurringId)
    .executeTakeFirst();

  if (!recurring) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Recurring expense not found',
      statusCode: 404
    });
  }

  const nextOccurrence = nextDate
    ? nextDate
    : formatDateOnly(calculateNextOccurrenceDate(recurring as any, new Date()) ?? new Date());

  const updated = await db
    .updateTable('recurring_expenses')
    .set({ status: 'active', next_occurrence_date: nextOccurrence })
    .where('id', '=', recurringId)
    .returning(['id', 'status', 'next_occurrence_date'])
    .executeTakeFirst();

  return updated;
}

export async function cancelRecurringExpense(organizationId: string, recurringId: string) {
  const updated = await db
    .updateTable('recurring_expenses')
    .set({ status: 'cancelled' })
    .where('organization_id', '=', organizationId)
    .where('id', '=', recurringId)
    .returning(['id', 'status'])
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Recurring expense not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function listUpcomingRecurring(organizationId: string, days: number) {
  const today = new Date();
  const end = new Date(today.getTime() + days * 86400000);
  const endDate = end.toISOString().split('T')[0];

  const recurring = await db
    .selectFrom('recurring_expenses')
    .leftJoin('categories', 'categories.id', 'recurring_expenses.category_id')
    .leftJoin('vendors', 'vendors.id', 'recurring_expenses.vendor_id')
    .select([
      'recurring_expenses.id',
      'recurring_expenses.description',
      'recurring_expenses.amount_cents',
      'recurring_expenses.next_occurrence_date',
      'categories.name as category_name',
      'vendors.name as vendor_name'
    ])
    .where('recurring_expenses.organization_id', '=', organizationId)
    .where('recurring_expenses.status', '=', 'active')
    .where('recurring_expenses.next_occurrence_date', '<=', endDate)
    .execute();

  const data = recurring.map((item: any) => ({
    recurring_expense_id: item.id,
    description: item.description,
    amount_cents: item.amount_cents,
    scheduled_date: item.next_occurrence_date,
    days_until: Math.max(0, Math.ceil((new Date(item.next_occurrence_date).getTime() - today.getTime()) / 86400000)),
    category: item.category_name ? { name: item.category_name } : null,
    vendor: item.vendor_name ? { name: item.vendor_name } : null
  }));

  return {
    data,
    summary: {
      total_upcoming_cents: data.reduce((sum: number, item: any) => sum + item.amount_cents, 0),
      period_days: days
    }
  };
}

export async function processRecurringExpenses() {
  const today = new Date().toISOString().split('T')[0];
  const due = await db
    .selectFrom('recurring_expenses')
    .selectAll()
    .where('status', '=', 'active')
    .where('next_occurrence_date', '<=', today)
    .execute();

  for (const recurring of due as any[]) {
    const expense = await createExpense(recurring.organization_id, recurring.created_by_user_id, {
      description: recurring.description,
      amount_cents: recurring.amount_cents,
      currency: recurring.currency,
      date: recurring.next_occurrence_date,
      category_id: recurring.category_id,
      vendor_id: recurring.vendor_id,
      payment_method: recurring.payment_method,
      is_from_bank: false,
      recurring_expense_id: recurring.id
    });

    const nextDate = calculateNextOccurrenceDate(recurring as any, new Date(recurring.next_occurrence_date));

    await db
      .updateTable('recurring_expenses')
      .set({
        total_generated_count: recurring.total_generated_count + 1,
        total_spent_cents: recurring.total_spent_cents + recurring.amount_cents,
        last_generated_at: new Date().toISOString(),
        last_generated_expense_id: expense.id,
        next_occurrence_date: nextDate ? formatDateOnly(nextDate) : recurring.next_occurrence_date,
        status: nextDate ? recurring.status : 'completed'
      })
      .where('id', '=', recurring.id)
      .execute();

    eventBus.publish('recurring_expense.generated', {
      recurring_expense_id: recurring.id,
      expense_id: expense.id,
      organization_id: recurring.organization_id,
      amount_cents: recurring.amount_cents
    });
  }
}
