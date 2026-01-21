import { sql } from 'kysely';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { calculateInvoiceTotals } from '../utils/invoice-calculations.js';
import { generateInvoiceNumber } from '../utils/invoice-number.js';
import { generateInvoicePdf } from '../integrations/pdf.js';
import { sendEmail } from '../integrations/email.js';
import { eventBus } from '../integrations/event-bus.js';
import { createMagicLink } from '../integrations/part4.js';

interface ListInvoiceOptions {
  page: number;
  perPage: number;
  status?: string[];
  client_id?: string;
  date_from?: string;
  date_to?: string;
  due_from?: string;
  due_to?: string;
  min_amount?: number;
  max_amount?: number;
  search?: string;
  sort?: string;
}

export async function listInvoices(organizationId: string, options: ListInvoiceOptions) {
  let query = db
    .selectFrom('invoices')
    .innerJoin('clients', 'clients.id', 'invoices.client_id')
    .select([
      'invoices.id',
      'invoices.invoice_number',
      'invoices.status',
      'invoices.issue_date',
      'invoices.due_date',
      'invoices.currency',
      'invoices.subtotal_cents',
      'invoices.discount_cents',
      'invoices.tax_cents',
      'invoices.total_cents',
      'invoices.amount_paid_cents',
      'invoices.amount_due_cents',
      'invoices.escrow_enabled',
      'invoices.sent_at',
      'invoices.viewed_at',
      'invoices.created_at',
      sql`json_build_object('id', clients.id, 'name', clients.name, 'email', clients.email)`.as('client')
    ])
    .where('invoices.organization_id', '=', organizationId);

  if (options.status?.length) {
    query = query.where('invoices.status', 'in', options.status as any);
  }

  if (options.client_id) {
    query = query.where('invoices.client_id', '=', options.client_id);
  }

  if (options.date_from) {
    query = query.where('invoices.issue_date', '>=', options.date_from);
  }

  if (options.date_to) {
    query = query.where('invoices.issue_date', '<=', options.date_to);
  }

  if (options.due_from) {
    query = query.where('invoices.due_date', '>=', options.due_from);
  }

  if (options.due_to) {
    query = query.where('invoices.due_date', '<=', options.due_to);
  }

  if (options.min_amount != null) {
    query = query.where('invoices.total_cents', '>=', options.min_amount);
  }

  if (options.max_amount != null) {
    query = query.where('invoices.total_cents', '<=', options.max_amount);
  }

  if (options.search) {
    const search = `%${options.search.toLowerCase()}%`;
    query = query.where((eb) =>
      eb.or([
        eb('invoices.invoice_number', 'ilike', search),
        eb('clients.name', 'ilike', search)
      ])
    );
  }

  const countRow = await query
    .select((eb) => eb.fn.count('invoices.id').as('total'))
    .executeTakeFirst();
  const total = Number(countRow?.total ?? 0);

  const sortMap: Record<string, string> = {
    issue_date: 'invoices.issue_date',
    due_date: 'invoices.due_date',
    total_cents: 'invoices.total_cents',
    created_at: 'invoices.created_at'
  };
  const sortKey = options.sort?.replace('-', '') ?? 'created_at';
  const sortColumn = sortMap[sortKey] ?? 'invoices.created_at';
  const sortDirection = options.sort?.startsWith('-') ? 'desc' : 'asc';

  const data = await query
    .orderBy(sortColumn as never, sortDirection as never)
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage)
    .execute();

  const summaryRow = await db
    .selectFrom('invoices')
    .select((eb) => [
      eb.fn.coalesce(eb.fn.sum('amount_due_cents'), eb.val(0)).as('total_outstanding_cents'),
      eb.fn.coalesce(
        eb.fn.sum(sql<number>`CASE WHEN status = 'overdue' THEN amount_due_cents ELSE 0 END`),
        eb.val(0)
      ).as('total_overdue_cents')
    ])
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  const statusCounts = await db
    .selectFrom('invoices')
    .select(['status', sql<number>`count(*)`.as('count')])
    .where('organization_id', '=', organizationId)
    .groupBy('status')
    .execute();

  const countByStatus = statusCounts.reduce<Record<string, number>>((acc, row: any) => {
    acc[row.status] = Number(row.count ?? 0);
    return acc;
  }, {});

  return {
    data,
    total,
    summary: {
      total_outstanding_cents: Number(summaryRow?.total_outstanding_cents ?? 0),
      total_overdue_cents: Number(summaryRow?.total_overdue_cents ?? 0),
      count_by_status: countByStatus
    }
  };
}

export async function getInvoice(organizationId: string, invoiceId: string, options: {
  includeLineItems?: boolean;
  includeActivities?: boolean;
  includeAttachments?: boolean;
  includePayments?: boolean;
  includeEscrow?: boolean;
}) {
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  if (['paid', 'cancelled'].includes(invoice.status)) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_STATE_TRANSITION,
      message: 'Cannot remind on paid or cancelled invoice',
      statusCode: 409
    });
  }

  const client = await db
    .selectFrom('clients')
    .select(['id', 'name', 'email'])
    .where('id', '=', invoice.client_id)
    .executeTakeFirst();

  const result: Record<string, any> = {
    ...invoice,
    client,
    payment_link_url: `${config.appBaseUrl}/pay/${invoice.payment_link_token}`
  };

  if (options.includeLineItems) {
    result.line_items = await db
      .selectFrom('invoice_line_items')
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .orderBy('sort_order', 'asc')
      .execute();
  }

  if (options.includeActivities) {
    result.activities = await db
      .selectFrom('invoice_activities')
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .orderBy('created_at', 'desc')
      .execute();
  }

  if (options.includeAttachments) {
    result.attachments = await db
      .selectFrom('invoice_attachments')
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .execute();
  }

  if (options.includePayments) {
    result.payments = await db
      .selectFrom('payments')
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .execute();
  }

  if (options.includeEscrow) {
    result.escrow = await db
      .selectFrom('escrow_transactions')
      .selectAll()
      .where('invoice_id', '=', invoiceId)
      .execute();
  }

  return result;
}

export async function createInvoice(
  organizationId: string,
  userId: string | null,
  payload: Record<string, any>
): Promise<Record<string, any>> {
  if (!payload.line_items || payload.line_items.length === 0) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Invoice must include at least one line item',
      statusCode: 400
    });
  }

  if (new Date(payload.due_date) < new Date(payload.issue_date)) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Due date must be on or after issue date',
      statusCode: 400
    });
  }

  if (payload.discount_type === 'percentage' && payload.discount_value > 100) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Discount percentage cannot exceed 100',
      statusCode: 400
    });
  }

  const lineItems = payload.line_items.map((item: any, index: number) => ({
    ...item,
    amount_cents: Math.round(Number(item.quantity ?? 1) * Number(item.unit_price_cents ?? 0)),
    sort_order: item.sort_order ?? index
  }));

  const totals = calculateInvoiceTotals({
    line_items: lineItems,
    discount_type: payload.discount_type,
    discount_value: payload.discount_value,
    tax_rate: payload.tax_rate,
    amount_paid_cents: 0
  });

  if (payload.discount_type === 'fixed' && payload.discount_value > totals.subtotal_cents) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Discount cannot exceed subtotal',
      statusCode: 400
    });
  }

  let settings = await db
    .selectFrom('invoice_number_settings')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  if (!settings) {
    settings = await db
      .insertInto('invoice_number_settings')
      .values({ organization_id: organizationId })
      .returningAll()
      .executeTakeFirst();
  }

  if (!settings) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Unable to create invoice settings',
      statusCode: 500
    });
  }

  const { invoiceNumber, nextNumber, lastResetAt } = generateInvoiceNumber({
    pattern: settings.pattern,
    next_number: settings.next_number,
    reset_frequency: settings.reset_frequency,
    last_reset_at: settings.last_reset_at
  });

  await db
    .updateTable('invoice_number_settings')
    .set({ next_number: nextNumber, last_reset_at: lastResetAt ?? settings.last_reset_at })
    .where('organization_id', '=', organizationId)
    .execute();

  const client = await db
    .selectFrom('clients')
    .select(['currency'])
    .where('id', '=', payload.client_id)
    .executeTakeFirst();

  if (!client) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Client not found',
      statusCode: 404
    });
  }

  const currency = payload.currency ?? client?.currency ?? 'USD';

  const invoice = await db
    .insertInto('invoices')
    .values({
      organization_id: organizationId,
      client_id: payload.client_id,
      invoice_number: invoiceNumber,
      reference: payload.reference ?? null,
      status: 'draft',
      issue_date: payload.issue_date,
      due_date: payload.due_date,
      currency,
      subtotal_cents: totals.subtotal_cents,
      discount_type: payload.discount_type ?? null,
      discount_value: payload.discount_value ?? null,
      discount_cents: totals.discount_cents,
      tax_rate: payload.tax_rate ?? null,
      tax_cents: totals.tax_cents,
      total_cents: totals.total_cents,
      amount_paid_cents: totals.amount_paid_cents,
      amount_due_cents: totals.amount_due_cents,
      notes: payload.notes ?? null,
      terms: payload.terms ?? null,
      footer: payload.footer ?? null,
      template_id: payload.template_id ?? null,
      escrow_enabled: payload.escrow_enabled ?? false,
      created_by_user_id: userId ?? null
    })
    .returningAll()
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create invoice',
      statusCode: 500
    });
  }

  await db
    .insertInto('invoice_line_items')
    .values(lineItems.map((item: any) => ({
      invoice_id: invoice.id,
      description: item.description,
      quantity: item.quantity ?? 1,
      unit: item.unit ?? null,
      unit_price_cents: item.unit_price_cents,
      amount_cents: item.amount_cents,
      tax_rate: item.tax_rate ?? null,
      category_id: item.category_id ?? null,
      sort_order: item.sort_order ?? 0
    })))
    .execute();

  await db.insertInto('invoice_activities').values({
    invoice_id: invoice.id,
    activity_type: 'created',
    description: 'Invoice created',
    performed_by_user_id: userId ?? null
  }).execute();

  const magicLink = await createMagicLink({
    organization_id: organizationId,
    entity_type: 'invoice_payment',
    entity_id: invoice.id,
    metadata: { invoice_number: invoice.invoice_number }
  });

  const invoiceWithLink = await db
    .updateTable('invoices')
    .set({ payment_link_token: magicLink.token })
    .where('id', '=', invoice.id)
    .returningAll()
    .executeTakeFirst();

  if (payload.escrow_enabled && payload.escrow_milestones?.length) {
    const milestoneSum = payload.escrow_milestones.reduce((sum: number, milestone: any) => sum + Number(milestone.amount_cents ?? 0), 0);
    if (milestoneSum !== totals.total_cents) {
      throw new ApiError({
        code: ERROR_CODES.INVALID_INPUT,
        message: 'Escrow milestones must sum to invoice total',
        statusCode: 400
      });
    }
    await db
      .insertInto('escrow_milestones')
      .values(payload.escrow_milestones.map((milestone: any, index: number) => ({
        invoice_id: invoice.id,
        description: milestone.description,
        amount_cents: milestone.amount_cents,
        percentage: milestone.percentage ?? null,
        sort_order: index
      })))
      .execute();
  }

  if (payload.send_immediately) {
    await sendInvoice(organizationId, userId, invoice.id, { to_emails: payload.to_emails });
  }

  const outputInvoice = invoiceWithLink ?? invoice;
  return {
    ...outputInvoice,
    payment_link_url: `${config.appBaseUrl}/pay/${outputInvoice.payment_link_token}`
  };
}

export async function updateInvoice(organizationId: string, invoiceId: string, payload: Record<string, any>) {
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  if (['paid', 'cancelled'].includes(invoice.status)) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_STATE_TRANSITION,
      message: 'Cannot modify a paid or cancelled invoice',
      statusCode: 409
    });
  }

  if (invoice.status !== 'draft') {
    const allowed = ['notes', 'terms', 'footer'];
    const payloadKeys = Object.keys(payload);
    const invalid = payloadKeys.filter((key) => !allowed.includes(key));
    if (invalid.length) {
      throw new ApiError({
        code: ERROR_CODES.INVALID_STATE_TRANSITION,
        message: 'Sent invoices can only update notes, terms, and footer',
        statusCode: 409
      });
    }
  }

  const issueDateForCheck = payload.issue_date ?? invoice.issue_date;
  if (payload.due_date && new Date(payload.due_date) < new Date(issueDateForCheck)) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Due date must be on or after issue date',
      statusCode: 400
    });
  }

  if (payload.discount_type === 'percentage' && payload.discount_value > 100) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Discount percentage cannot exceed 100',
      statusCode: 400
    });
  }

  const updates = { ...payload } as Record<string, any>;

  if (payload.line_items && invoice.status === 'draft') {
    const lineItems = payload.line_items.map((item: any, index: number) => ({
      ...item,
      amount_cents: Math.round(Number(item.quantity ?? 1) * Number(item.unit_price_cents ?? 0)),
      sort_order: item.sort_order ?? index
    }));

    const totals = calculateInvoiceTotals({
      line_items: lineItems,
      discount_type: payload.discount_type ?? invoice.discount_type,
      discount_value: payload.discount_value ?? invoice.discount_value,
      tax_rate: payload.tax_rate ?? invoice.tax_rate,
      amount_paid_cents: invoice.amount_paid_cents
    });

    if (payload.discount_type === 'fixed' && payload.discount_value > totals.subtotal_cents) {
      throw new ApiError({
        code: ERROR_CODES.INVALID_INPUT,
        message: 'Discount cannot exceed subtotal',
        statusCode: 400
      });
    }

    updates.subtotal_cents = totals.subtotal_cents;
    updates.discount_cents = totals.discount_cents;
    updates.tax_cents = totals.tax_cents;
    updates.total_cents = totals.total_cents;
    updates.amount_due_cents = totals.amount_due_cents;

    await db.deleteFrom('invoice_line_items').where('invoice_id', '=', invoiceId).execute();
    await db
      .insertInto('invoice_line_items')
      .values(lineItems.map((item: any) => ({
        invoice_id: invoiceId,
        description: item.description,
        quantity: item.quantity ?? 1,
        unit: item.unit ?? null,
        unit_price_cents: item.unit_price_cents,
        amount_cents: item.amount_cents,
        tax_rate: item.tax_rate ?? null,
        category_id: item.category_id ?? null,
        sort_order: item.sort_order ?? 0
      })))
      .execute();
  }

  if (invoice.status === 'paid') {
    throw new ApiError({
      code: ERROR_CODES.INVALID_STATE_TRANSITION,
      message: 'Cannot cancel a paid invoice',
      statusCode: 409
    });
  }

  const updated = await db
    .updateTable('invoices')
    .set(updates)
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to update invoice',
      statusCode: 500
    });
  }

  await db.insertInto('invoice_activities').values({
    invoice_id: invoiceId,
    activity_type: 'updated',
    description: 'Invoice updated'
  }).execute();

  return updated;
}

export async function deleteInvoice(organizationId: string, invoiceId: string) {
  const invoice = await db
    .selectFrom('invoices')
    .select(['id', 'status'])
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  if (invoice.status !== 'draft') {
    throw new ApiError({
      code: ERROR_CODES.INVALID_STATE_TRANSITION,
      message: 'Cannot delete sent invoice. Cancel it instead.',
      statusCode: 409
    });
  }

  await db.deleteFrom('invoices').where('id', '=', invoiceId).execute();
  return { id: invoiceId, deleted: true };
}

export async function sendInvoice(
  organizationId: string,
  userId: string | null,
  invoiceId: string,
  payload: { to_emails?: string[]; cc_emails?: string[]; subject?: string; message?: string; attach_pdf?: boolean }
) {
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  if (invoice.status === 'paid') {
    throw new ApiError({
      code: ERROR_CODES.INVOICE_ALREADY_PAID,
      message: 'Invoice already paid',
      statusCode: 409
    });
  }

  const lineItemCount = await db
    .selectFrom('invoice_line_items')
    .select((eb) => eb.fn.count('id').as('count'))
    .where('invoice_id', '=', invoiceId)
    .executeTakeFirst();

  if (Number(lineItemCount?.count ?? 0) === 0) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Invoice must include at least one line item before sending',
      statusCode: 400
    });
  }

  const client = await db
    .selectFrom('clients')
    .select(['email', 'name'])
    .where('id', '=', invoice.client_id)
    .executeTakeFirst();

  const toEmails = payload.to_emails?.length ? payload.to_emails : [client?.email ?? ''];
  const subject = payload.subject ?? `Invoice ${invoice.invoice_number}`;
  const message = payload.message ?? 'Please find your invoice attached.';

  await sendEmail({
    to: toEmails,
    cc: payload.cc_emails,
    subject,
    html: `<p>${message}</p><p><a href="${config.appBaseUrl}/pay/${invoice.payment_link_token}">Pay Now</a></p>`,
    text: message
  });

  const updated = await db
    .updateTable('invoices')
    .set({
      status: invoice.status === 'draft' ? 'sent' : invoice.status,
      sent_at: new Date().toISOString(),
      sent_to_emails: toEmails
    })
    .where('id', '=', invoiceId)
    .returningAll()
    .executeTakeFirst();

  await db.insertInto('invoice_activities').values({
    invoice_id: invoiceId,
    activity_type: 'sent',
    description: `Invoice sent to ${toEmails.join(', ')}`,
    performed_by_user_id: userId ?? null
  }).execute();

  return updated;
}

export async function sendReminder(
  organizationId: string,
  userId: string,
  invoiceId: string,
  payload: { template_id?: string; custom_message?: string }
) {
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  const client = await db
    .selectFrom('clients')
    .select(['email', 'name'])
    .where('id', '=', invoice.client_id)
    .executeTakeFirst();

  const subject = `Reminder: Invoice ${invoice.invoice_number}`;
  const message = payload.custom_message ?? 'This is a reminder that your invoice is due.';

  await sendEmail({
    to: [client?.email ?? ''],
    subject,
    html: `<p>${message}</p>`
  });

  await db.insertInto('reminder_logs').values({
    invoice_id: invoiceId,
    type: 'manual',
    reminder_type: null,
    sent_to_email: client?.email ?? '',
    subject,
    status: 'sent',
    sent_by_user_id: userId
  }).execute();

  await db.insertInto('invoice_activities').values({
    invoice_id: invoiceId,
    activity_type: 'reminder_sent',
    description: 'Manual reminder sent',
    performed_by_user_id: userId
  }).execute();

  return { reminder_sent: true, sent_to: client?.email ?? '', sent_at: new Date().toISOString() };
}

export async function duplicateInvoice(organizationId: string, userId: string, invoiceId: string, payload: {
  issue_date?: string;
  due_date?: string;
}) {
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  const lineItems = await db
    .selectFrom('invoice_line_items')
    .selectAll()
    .where('invoice_id', '=', invoiceId)
    .execute();

  const created = await createInvoice(organizationId, userId, {
    client_id: invoice.client_id,
    issue_date: payload.issue_date ?? new Date().toISOString().split('T')[0],
    due_date: payload.due_date ?? invoice.due_date,
    currency: invoice.currency,
    line_items: lineItems.map((item: any) => ({
      description: item.description,
      quantity: item.quantity,
      unit: item.unit,
      unit_price_cents: item.unit_price_cents,
      category_id: item.category_id
    })),
    discount_type: invoice.discount_type,
    discount_value: invoice.discount_value,
    tax_rate: invoice.tax_rate,
    notes: invoice.notes,
    terms: invoice.terms,
    footer: invoice.footer,
    template_id: invoice.template_id,
    escrow_enabled: invoice.escrow_enabled
  });

  return created;
}

export async function cancelInvoice(organizationId: string, userId: string, invoiceId: string, payload: {
  reason?: string;
  notify_client?: boolean;
}) {
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  const updated = await db
    .updateTable('invoices')
    .set({ status: 'cancelled' })
    .where('id', '=', invoiceId)
    .returningAll()
    .executeTakeFirst();

  await db.insertInto('invoice_activities').values({
    invoice_id: invoiceId,
    activity_type: 'cancelled',
    description: payload.reason ? `Invoice cancelled: ${payload.reason}` : 'Invoice cancelled',
    performed_by_user_id: userId
  }).execute();

  if (payload.notify_client) {
    const client = await db
      .selectFrom('clients')
      .select(['email'])
      .where('id', '=', invoice.client_id)
      .executeTakeFirst();

    await sendEmail({
      to: [client?.email ?? ''],
      subject: `Invoice ${invoice.invoice_number} cancelled`,
      html: `<p>Your invoice has been cancelled.</p>`
    });
  }

  return updated;
}

export async function markInvoicePaid(
  organizationId: string,
  userId: string,
  invoiceId: string,
  payload: { amount_cents: number; payment_method: string; paid_at?: string; reference?: string; notes?: string }
) {
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  if (invoice.status === 'cancelled') {
    throw new ApiError({
      code: ERROR_CODES.INVALID_STATE_TRANSITION,
      message: 'Cannot pay a cancelled invoice',
      statusCode: 409
    });
  }

  if (invoice.status === 'paid') {
    throw new ApiError({
      code: ERROR_CODES.INVOICE_ALREADY_PAID,
      message: 'Invoice already paid',
      statusCode: 409
    });
  }

  if (payload.amount_cents > invoice.amount_due_cents) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Payment exceeds amount due',
      statusCode: 400
    });
  }

  const newAmountPaid = Number(invoice.amount_paid_cents) + payload.amount_cents;
  const status = newAmountPaid >= invoice.total_cents ? 'paid' : 'partial';
  const amountDue = Math.max(0, invoice.total_cents - newAmountPaid);

  const payment = await db
    .insertInto('payments')
    .values({
      organization_id: organizationId,
      invoice_id: invoiceId,
      client_id: invoice.client_id,
      amount_cents: payload.amount_cents,
      currency: invoice.currency,
      payment_method: payload.payment_method,
      status: 'completed',
      manual_method: payload.payment_method,
      manual_reference: payload.reference ?? null,
      manual_notes: payload.notes ?? null,
      paid_at: payload.paid_at ?? new Date().toISOString(),
      created_by_user_id: userId
    })
    .returningAll()
    .executeTakeFirst();

  const updatedInvoice = await db
    .updateTable('invoices')
    .set({
      amount_paid_cents: newAmountPaid,
      amount_due_cents: amountDue,
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : invoice.paid_at
    })
    .where('id', '=', invoiceId)
    .returningAll()
    .executeTakeFirst();

  if (payment?.id) {
    await db.insertInto('payment_receipts').values({
      payment_id: payment.id,
      receipt_number: `RCP-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-6)}`,
      pdf_url: null,
      sent_to_email: null,
      sent_at: null
    }).execute();
  }

  await db.insertInto('invoice_activities').values({
    invoice_id: invoiceId,
    activity_type: 'payment_received',
    description: `Manual payment recorded: ${payload.amount_cents}`,
    performed_by_user_id: userId
  }).execute();

  eventBus.publish('payment.completed', {
    organization_id: organizationId,
    payment_id: payment?.id ?? null,
    invoice_id: invoiceId,
    client_id: invoice.client_id,
    amount_cents: payload.amount_cents,
    currency: invoice.currency,
    date: (payload.paid_at ?? new Date().toISOString()).split('T')[0],
    description: `Payment for invoice ${invoice.invoice_number}`
  });

  return { invoice: updatedInvoice, payment };
}

export async function generatePdf(organizationId: string, invoiceId: string) {
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  const lineItems = await db
    .selectFrom('invoice_line_items')
    .selectAll()
    .where('invoice_id', '=', invoiceId)
    .orderBy('sort_order', 'asc')
    .execute();

  const client = await db
    .selectFrom('clients')
    .select(['name'])
    .where('id', '=', invoice.client_id)
    .executeTakeFirst();

  const file = await generateInvoicePdf({
    invoiceNumber: invoice.invoice_number,
    clientName: client?.name ?? 'Client',
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    currency: invoice.currency,
    lineItems: lineItems.map((item: any) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unit_price_cents: Number(item.unit_price_cents),
      amount_cents: Number(item.amount_cents)
    })),
    subtotal_cents: Number(invoice.subtotal_cents),
    discount_cents: Number(invoice.discount_cents),
    tax_cents: Number(invoice.tax_cents),
    total_cents: Number(invoice.total_cents),
    notes: invoice.notes,
    terms: invoice.terms
  });

  return file;
}
