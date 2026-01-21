import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { createPaymentIntent, verifyPaymentIntent } from '../integrations/stripe.js';
import { eventBus } from '../integrations/event-bus.js';
import { resolveMagicLink } from '../integrations/part4.js';

async function resolveInvoiceId(token: string) {
  const link = await resolveMagicLink(token);
  if (!link || link.entity_type !== 'invoice_payment') {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Payment link not found',
      statusCode: 404
    });
  }
  return link.entity_id as string;
}

export async function getInvoiceByPaymentToken(token: string) {
  const invoiceId = await resolveInvoiceId(token);
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
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
    .select(['id', 'name', 'email'])
    .where('id', '=', invoice.client_id)
    .executeTakeFirst();

  const lineItems = await db
    .selectFrom('invoice_line_items')
    .selectAll()
    .where('invoice_id', '=', invoice.id)
    .execute();

  return { invoice, client, line_items: lineItems };
}

export async function createPaymentIntentForToken(token: string) {
  const invoiceId = await resolveInvoiceId(token);
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
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
      message: 'Invoice cannot be paid',
      statusCode: 409
    });
  }

  if (Number(invoice.amount_due_cents) <= 0) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Invoice has no outstanding balance',
      statusCode: 400
    });
  }

  const intent = await createPaymentIntent({
    amount_cents: Number(invoice.amount_due_cents),
    currency: invoice.currency,
    metadata: {
      invoice_id: invoice.id,
      organization_id: invoice.organization_id,
      payment_link_token: token
    }
  });

  return intent;
}

export async function confirmPaymentIntent(token: string, paymentIntentId: string) {
  const invoiceId = await resolveInvoiceId(token);
  const invoice = await db
    .selectFrom('invoices')
    .selectAll()
    .where('id', '=', invoiceId)
    .executeTakeFirst();

  if (!invoice) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Invoice not found',
      statusCode: 404
    });
  }

  const existing = await db
    .selectFrom('payments')
    .select(['id'])
    .where('provider_payment_id', '=', paymentIntentId)
    .executeTakeFirst();

  if (existing) {
    return { already_processed: true };
  }

  const intent = await verifyPaymentIntent(paymentIntentId);
  if (intent.status !== 'succeeded') {
    throw new ApiError({
      code: ERROR_CODES.PAYMENT_FAILED,
      message: 'Payment not completed',
      statusCode: 402
    });
  }

  const newAmountPaid = Number(invoice.amount_paid_cents) + Number(invoice.amount_due_cents);
  const status = newAmountPaid >= invoice.total_cents ? 'paid' : 'partial';

  const payment = await db
    .insertInto('payments')
    .values({
      organization_id: invoice.organization_id,
      invoice_id: invoice.id,
      client_id: invoice.client_id,
      amount_cents: Number(invoice.amount_due_cents),
      currency: invoice.currency,
      payment_method: 'stripe_card',
      status: 'completed',
      provider: 'stripe',
      provider_payment_id: paymentIntentId,
      paid_at: new Date().toISOString()
    })
    .returningAll()
    .executeTakeFirst();

  const updatedInvoice = await db
    .updateTable('invoices')
    .set({
      amount_paid_cents: newAmountPaid,
      amount_due_cents: Math.max(0, invoice.total_cents - newAmountPaid),
      status,
      paid_at: status === 'paid' ? new Date().toISOString() : invoice.paid_at
    })
    .where('id', '=', invoice.id)
    .returningAll()
    .executeTakeFirst();

  await db.insertInto('invoice_activities').values({
    invoice_id: invoice.id,
    activity_type: 'payment_received',
    description: 'Payment received via Stripe',
    metadata: { payment_intent_id: paymentIntentId }
  }).execute();

  if (payment?.id) {
    await db.insertInto('payment_receipts').values({
      payment_id: payment.id,
      receipt_number: `RCP-${new Date().getUTCFullYear()}-${String(Date.now()).slice(-6)}`,
      pdf_url: null,
      sent_to_email: null,
      sent_at: null
    }).execute();
  }

  eventBus.publish('payment.completed', {
    organization_id: invoice.organization_id,
    payment_id: payment?.id ?? null,
    invoice_id: invoice.id,
    client_id: invoice.client_id,
    amount_cents: Number(invoice.amount_due_cents),
    currency: invoice.currency,
    date: new Date().toISOString().split('T')[0],
    description: `Payment for invoice ${invoice.invoice_number}`
  });

  return { payment, invoice: updatedInvoice };
}
