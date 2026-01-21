import { sql } from 'kysely';
import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { refundPayment } from '../integrations/stripe.js';
import { eventBus } from '../integrations/event-bus.js';

interface ListPaymentsOptions {
  page: number;
  perPage: number;
  invoice_id?: string;
  client_id?: string;
  status?: string;
  payment_method?: string;
  date_from?: string;
  date_to?: string;
  sort?: string;
}

export async function listPayments(organizationId: string, options: ListPaymentsOptions) {
  let query = db
    .selectFrom('payments')
    .innerJoin('invoices', 'invoices.id', 'payments.invoice_id')
    .innerJoin('clients', 'clients.id', 'payments.client_id')
    .select([
      'payments.id',
      'payments.amount_cents',
      'payments.currency',
      'payments.fee_cents',
      'payments.net_amount_cents',
      'payments.payment_method',
      'payments.status',
      'payments.paid_at',
      sql`json_build_object('id', invoices.id, 'invoice_number', invoices.invoice_number)`.as('invoice'),
      sql`json_build_object('id', clients.id, 'name', clients.name)`.as('client')
    ])
    .where('payments.organization_id', '=', organizationId);

  if (options.invoice_id) {
    query = query.where('payments.invoice_id', '=', options.invoice_id);
  }

  if (options.client_id) {
    query = query.where('payments.client_id', '=', options.client_id);
  }

  if (options.status) {
    query = query.where('payments.status', '=', options.status);
  }

  if (options.payment_method) {
    query = query.where('payments.payment_method', '=', options.payment_method);
  }

  if (options.date_from) {
    query = query.where('payments.paid_at', '>=', options.date_from);
  }

  if (options.date_to) {
    query = query.where('payments.paid_at', '<=', options.date_to);
  }

  const countRow = await query
    .select((eb) => eb.fn.count('payments.id').as('total'))
    .executeTakeFirst();

  const total = Number(countRow?.total ?? 0);

  const sortMap: Record<string, string> = {
    paid_at: 'payments.paid_at',
    amount_cents: 'payments.amount_cents',
    created_at: 'payments.created_at'
  };

  const sortKey = options.sort?.replace('-', '') ?? 'paid_at';
  const sortColumn = sortMap[sortKey] ?? 'payments.paid_at';
  const sortDirection = options.sort?.startsWith('-') ? 'desc' : 'asc';

  const data = await query
    .orderBy(sortColumn as never, sortDirection as never)
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage)
    .execute();

  const summary = await db
    .selectFrom('payments')
    .select((eb) => [
      eb.fn.coalesce(eb.fn.sum('amount_cents'), eb.val(0)).as('total_received_cents'),
      eb.fn.coalesce(eb.fn.sum('fee_cents'), eb.val(0)).as('total_fees_cents'),
      eb.fn.coalesce(eb.fn.sum('net_amount_cents'), eb.val(0)).as('total_net_cents')
    ])
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  return {
    data,
    total,
    summary: {
      total_received_cents: Number(summary?.total_received_cents ?? 0),
      total_fees_cents: Number(summary?.total_fees_cents ?? 0),
      total_net_cents: Number(summary?.total_net_cents ?? 0)
    }
  };
}

export async function getPayment(organizationId: string, paymentId: string) {
  const payment = await db
    .selectFrom('payments')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', paymentId)
    .executeTakeFirst();

  if (!payment) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Payment not found',
      statusCode: 404
    });
  }

  const refunds = await db
    .selectFrom('payment_refunds')
    .selectAll()
    .where('payment_id', '=', paymentId)
    .execute();

  const receipt = await db
    .selectFrom('payment_receipts')
    .selectAll()
    .where('payment_id', '=', paymentId)
    .executeTakeFirst();

  return { ...payment, refunds, receipt };
}

export async function refundPaymentById(
  organizationId: string,
  userId: string,
  paymentId: string,
  payload: { amount_cents?: number; reason?: string }
) {
  const payment = await db
    .selectFrom('payments')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', paymentId)
    .executeTakeFirst();

  if (!payment) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Payment not found',
      statusCode: 404
    });
  }

  const refundable = Number(payment.amount_cents) - Number(payment.refunded_amount_cents ?? 0);
  const amount = payload.amount_cents ?? refundable;

  if (amount <= 0 || amount > refundable) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Refund amount exceeds available balance',
      statusCode: 400
    });
  }

  if (payment.provider === 'stripe' && payment.provider_payment_id) {
    await refundPayment(payment.provider_payment_id, amount);
  }

  const refund = await db
    .insertInto('payment_refunds')
    .values({
      payment_id: paymentId,
      amount_cents: amount,
      reason: payload.reason ?? null,
      status: 'completed',
      created_by_user_id: userId,
      completed_at: new Date().toISOString()
    })
    .returningAll()
    .executeTakeFirst();

  const updatedPayment = await db
    .updateTable('payments')
    .set({
      refunded_amount_cents: Number(payment.refunded_amount_cents) + amount,
      status: amount === refundable ? 'refunded' : 'partially_refunded',
      refunded_at: new Date().toISOString()
    })
    .where('id', '=', paymentId)
    .returningAll()
    .executeTakeFirst();

  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('id', '=', payment.invoice_id)
    .executeTakeFirst();

  if (invoice) {
    const newAmountPaid = Math.max(0, Number(invoice.amount_paid_cents) - amount);
    const newAmountDue = Math.max(0, Number(invoice.total_cents) - newAmountPaid);
    const status = newAmountPaid === 0 ? 'sent' : 'partial';

    await db
      .updateTable('invoices')
      .set({
        amount_paid_cents: newAmountPaid,
        amount_due_cents: newAmountDue,
        status
      })
      .where('id', '=', invoice.id)
      .execute();

    await db.insertInto('invoice_activities').values({
      invoice_id: invoice.id,
      activity_type: 'refunded',
      description: `Refunded ${amount}`,
      performed_by_user_id: userId
    }).execute();

    eventBus.publish('payment.refunded', {
      organization_id: organizationId,
      payment_id: paymentId,
      refund_id: refund?.id ?? null,
      invoice_id: invoice.id,
      client_id: invoice.client_id,
      amount_cents: amount,
      currency: invoice.currency,
      date: new Date().toISOString().split('T')[0],
      description: `Refund for invoice ${invoice.invoice_number}`
    });
  }

  return { payment: updatedPayment, refund };
}
