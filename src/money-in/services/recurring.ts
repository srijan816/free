import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { calculateNextIssueDate, formatDateOnly } from '../utils/recurrence.js';
import { createInvoice } from './invoices.js';

interface ListRecurringOptions {
  page: number;
  perPage: number;
  status?: string;
  client_id?: string;
}

export async function listRecurringSchedules(organizationId: string, options: ListRecurringOptions) {
  let query = db
    .selectFrom('recurring_schedules')
    .selectAll()
    .where('organization_id', '=', organizationId);

  if (options.status) {
    query = query.where('status', '=', options.status);
  }

  if (options.client_id) {
    query = query.where('client_id', '=', options.client_id);
  }

  const countRow = await query.select((eb) => eb.fn.count('id').as('total')).executeTakeFirst();
  const total = Number(countRow?.total ?? 0);

  const data = await query
    .orderBy('created_at', 'desc')
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage)
    .execute();

  return { data, total };
}

export async function createRecurringSchedule(organizationId: string, payload: Record<string, any>) {
  const schedule = await db
    .insertInto('recurring_schedules')
    .values({
      organization_id: organizationId,
      client_id: payload.client_id,
      name: payload.name,
      frequency: payload.frequency,
      frequency_interval: payload.frequency_interval ?? 1,
      custom_days: payload.custom_days ?? null,
      start_date: payload.start_date,
      end_date: payload.end_date ?? null,
      next_issue_date: payload.next_issue_date ?? payload.start_date,
      template: payload.template,
      auto_send: payload.auto_send ?? false,
      send_days_before_due: payload.send_days_before_due ?? 0,
      status: payload.status ?? 'active'
    })
    .returningAll()
    .executeTakeFirst();

  if (!schedule) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create schedule',
      statusCode: 500
    });
  }

  return schedule;
}

export async function updateRecurringSchedule(
  organizationId: string,
  scheduleId: string,
  payload: Record<string, any>
) {
  const updated = await db
    .updateTable('recurring_schedules')
    .set(payload)
    .where('organization_id', '=', organizationId)
    .where('id', '=', scheduleId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Recurring schedule not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function pauseRecurringSchedule(organizationId: string, scheduleId: string) {
  return updateRecurringSchedule(organizationId, scheduleId, { status: 'paused' });
}

export async function resumeRecurringSchedule(organizationId: string, scheduleId: string) {
  return updateRecurringSchedule(organizationId, scheduleId, { status: 'active' });
}

export async function skipRecurringOccurrence(organizationId: string, scheduleId: string, skip_date: string, reason?: string) {
  const schedule = await db
    .selectFrom('recurring_schedules')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', scheduleId)
    .executeTakeFirst();

  if (!schedule) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Recurring schedule not found',
      statusCode: 404
    });
  }

  const skip = await db
    .insertInto('recurring_skips')
    .values({
      recurring_schedule_id: scheduleId,
      skip_date,
      reason: reason ?? null
    })
    .returningAll()
    .executeTakeFirst();

  return skip;
}

export async function processRecurringSchedules() {
  const today = new Date();
  const dueSchedules = await db
    .selectFrom('recurring_schedules')
    .selectAll()
    .where('status', '=', 'active')
    .where('next_issue_date', '<=', formatDateOnly(today))
    .execute();

  for (const schedule of dueSchedules) {
    const skip = await db
      .selectFrom('recurring_skips')
      .select(['id'])
      .where('recurring_schedule_id', '=', schedule.id)
      .where('skip_date', '=', schedule.next_issue_date)
      .executeTakeFirst();

    if (!skip) {
      await generateInvoiceFromSchedule(schedule.organization_id, schedule);
    }

    const nextDate = calculateNextIssueDate(schedule as any, today);
    const updates: Record<string, any> = {
      last_generated_at: new Date().toISOString(),
      invoices_generated_count: Number(schedule.invoices_generated_count ?? 0) + (skip ? 0 : 1)
    };

    if (nextDate && (!schedule.end_date || nextDate <= new Date(schedule.end_date))) {
      updates.next_issue_date = formatDateOnly(nextDate);
    } else {
      updates.status = 'completed';
    }

    await db
      .updateTable('recurring_schedules')
      .set(updates)
      .where('id', '=', schedule.id)
      .execute();
  }
}

async function generateInvoiceFromSchedule(organizationId: string, schedule: any) {
  const template = schedule.template as any;
  const issueDate = schedule.next_issue_date;
  const termsDays = Number(template.payment_terms_days ?? 0);
  const dueDateObj = new Date(issueDate);
  dueDateObj.setUTCDate(dueDateObj.getUTCDate() + termsDays);
  const dueDate = formatDateOnly(dueDateObj);

  const created = await createInvoice(organizationId, null, {
    client_id: schedule.client_id,
    issue_date: issueDate,
    due_date: dueDate,
    currency: template.currency,
    line_items: template.line_items,
    tax_rate: template.tax_rate,
    discount_type: template.discount_type,
    discount_value: template.discount_value,
    notes: template.notes,
    terms: template.terms,
    template_id: template.template_id,
    escrow_enabled: template.escrow_enabled,
    send_immediately: schedule.auto_send
  });

  await db
    .updateTable('recurring_schedules')
    .set({ last_generated_invoice_id: created.id })
    .where('id', '=', schedule.id)
    .execute();

  return created;
}
