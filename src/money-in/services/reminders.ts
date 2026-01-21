import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { sendEmail } from '../integrations/email.js';

export async function getReminderSettings(organizationId: string) {
  let settings = await db
    .selectFrom('reminder_settings')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  if (!settings) {
    settings = await db
      .insertInto('reminder_settings')
      .values({ organization_id: organizationId })
      .returningAll()
      .executeTakeFirst();
  }

  return settings;
}

export async function updateReminderSettings(organizationId: string, payload: Record<string, any>) {
  const updated = await db
    .updateTable('reminder_settings')
    .set(payload)
    .where('organization_id', '=', organizationId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Reminder settings not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function listReminderTemplates(organizationId: string) {
  return db
    .selectFrom('reminder_templates')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('created_at', 'desc')
    .execute();
}

export async function createReminderTemplate(organizationId: string, payload: Record<string, any>) {
  const created = await db
    .insertInto('reminder_templates')
    .values({
      organization_id: organizationId,
      name: payload.name,
      type: payload.type,
      subject: payload.subject,
      body_html: payload.body_html,
      body_text: payload.body_text,
      is_default: payload.is_default ?? false,
      is_system: payload.is_system ?? false
    })
    .returningAll()
    .executeTakeFirst();

  if (!created) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create template',
      statusCode: 500
    });
  }

  return created;
}

export async function updateReminderTemplate(organizationId: string, templateId: string, payload: Record<string, any>) {
  const updated = await db
    .updateTable('reminder_templates')
    .set(payload)
    .where('organization_id', '=', organizationId)
    .where('id', '=', templateId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Template not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function deleteReminderTemplate(organizationId: string, templateId: string) {
  const template = await db
    .selectFrom('reminder_templates')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', templateId)
    .executeTakeFirst();

  if (!template) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Template not found',
      statusCode: 404
    });
  }

  if (template.is_system) {
    throw new ApiError({
      code: ERROR_CODES.CONFLICT,
      message: 'System templates cannot be deleted',
      statusCode: 409
    });
  }

  await db
    .deleteFrom('reminder_templates')
    .where('id', '=', templateId)
    .execute();

  return { id: templateId, deleted: true };
}

export async function listReminderLogs(invoiceId: string) {
  return db
    .selectFrom('reminder_logs')
    .selectAll()
    .where('invoice_id', '=', invoiceId)
    .orderBy('sent_at', 'desc')
    .execute();
}

export async function processAutomaticReminders() {
  const orgs = await db
    .selectFrom('reminder_settings')
    .selectAll()
    .where('is_enabled', '=', true)
    .execute();

  for (const settings of orgs) {
    const invoices = await db
      .selectFrom('invoices')
      .selectAll()
      .where('organization_id', '=', settings.organization_id)
      .where('status', 'in', ['sent', 'viewed', 'partial', 'overdue'] as any)
      .where('reminders_paused', '=', false)
      .execute();

    const reminderRules = Array.isArray(settings.reminders)
      ? settings.reminders
      : JSON.parse(settings.reminders ?? '[]');

    for (const invoice of invoices) {
      const reminderCount = await db
        .selectFrom('reminder_logs')
        .select((eb) => eb.fn.count('id').as('count'))
        .where('invoice_id', '=', invoice.id)
        .executeTakeFirst();

      if (Number(reminderCount?.count ?? 0) >= Number(settings.max_reminders_per_invoice)) {
        continue;
      }

      for (const rule of reminderRules) {
        if (!rule.is_enabled) continue;

        const shouldSend = shouldSendReminder(invoice.due_date, rule.type, Number(rule.days));
        if (!shouldSend) continue;

        const alreadySent = await db
          .selectFrom('reminder_logs')
          .select(['id'])
          .where('invoice_id', '=', invoice.id)
          .where('reminder_type', '=', rule.type)
          .where('sent_at', '>=', new Date().toISOString().split('T')[0])
          .executeTakeFirst();

        if (alreadySent) continue;

        const client = await db
          .selectFrom('clients')
          .select(['email', 'name'])
          .where('id', '=', invoice.client_id)
          .executeTakeFirst();

        const subject = `Reminder: Invoice ${invoice.invoice_number}`;
        const message = `Your invoice ${invoice.invoice_number} is due on ${invoice.due_date}.`;

        await sendEmail({
          to: [client?.email ?? ''],
          subject,
          html: `<p>${message}</p>`
        });

        await db.insertInto('reminder_logs').values({
          invoice_id: invoice.id,
          type: 'automatic',
          reminder_type: rule.type,
          sent_to_email: client?.email ?? '',
          subject,
          status: 'sent'
        }).execute();
      }
    }
  }
}

function shouldSendReminder(dueDate: string, type: string, days: number) {
  const due = new Date(dueDate);
  const today = new Date();
  const target = new Date(due);

  if (type === 'before_due') {
    target.setUTCDate(target.getUTCDate() - days);
  } else if (type === 'after_due') {
    target.setUTCDate(target.getUTCDate() + days);
  }

  return target.toISOString().split('T')[0] === today.toISOString().split('T')[0];
}
