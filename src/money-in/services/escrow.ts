import { sql } from 'kysely';
import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { eventBus } from '../integrations/event-bus.js';

const AUTO_RELEASE_DAYS = 14;

export async function getEscrowDashboard(organizationId: string) {
  const account = await db
    .selectFrom('escrow_accounts')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  const pending_releases = await db
    .selectFrom('escrow_transactions')
    .innerJoin('invoices', 'invoices.id', 'escrow_transactions.invoice_id')
    .innerJoin('clients', 'clients.id', 'escrow_transactions.client_id')
    .select([
      'escrow_transactions.id',
      'escrow_transactions.amount_cents',
      'escrow_transactions.release_requested_at',
      'escrow_transactions.auto_release_date',
      'invoices.invoice_number',
      'clients.name as client_name'
    ])
    .where('escrow_transactions.status', '=', 'release_requested')
    .where('invoices.organization_id', '=', organizationId)
    .execute();

  const active_disputes = await db
    .selectFrom('escrow_disputes')
    .innerJoin('escrow_transactions', 'escrow_transactions.id', 'escrow_disputes.escrow_transaction_id')
    .innerJoin('invoices', 'invoices.id', 'escrow_transactions.invoice_id')
    .select([
      'escrow_disputes.id',
      'escrow_disputes.status',
      'escrow_disputes.reason',
      'escrow_transactions.amount_cents',
      'invoices.invoice_number'
    ])
    .where('invoices.organization_id', '=', organizationId)
    .where('escrow_disputes.status', '=', 'open')
    .execute();

  return { account, pending_releases, active_disputes };
}

export async function requestRelease(
  organizationId: string,
  userId: string,
  transactionId: string,
  payload: { message_to_client?: string; milestone_id?: string }
) {
  const transaction = await db
    .selectFrom('escrow_transactions')
    .innerJoin('invoices', 'invoices.id', 'escrow_transactions.invoice_id')
    .select([
      'escrow_transactions.id',
      'escrow_transactions.status',
      'escrow_transactions.amount_cents',
      'escrow_transactions.invoice_id',
      'invoices.organization_id'
    ])
    .where('escrow_transactions.id', '=', transactionId)
    .executeTakeFirst();

  if (!transaction || transaction.organization_id !== organizationId) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Escrow transaction not found',
      statusCode: 404
    });
  }

  if (transaction.status !== 'funded') {
    throw new ApiError({
      code: ERROR_CODES.ESCROW_NOT_FUNDED,
      message: 'Escrow must be funded before requesting release',
      statusCode: 409
    });
  }

  const autoReleaseDate = new Date();
  autoReleaseDate.setUTCDate(autoReleaseDate.getUTCDate() + AUTO_RELEASE_DAYS);

  const updated = await db
    .updateTable('escrow_transactions')
    .set({
      status: 'release_requested',
      release_requested_at: new Date().toISOString(),
      auto_release_date: autoReleaseDate.toISOString().split('T')[0]
    })
    .where('id', '=', transactionId)
    .returningAll()
    .executeTakeFirst();

  await db.insertInto('invoice_activities').values({
    invoice_id: transaction.invoice_id ?? null,
    activity_type: 'status_changed',
    description: 'Escrow release requested',
    performed_by_user_id: userId,
    metadata: payload
  }).execute();

  eventBus.publish('escrow.release_requested', {
    organization_id: organizationId,
    transaction_id: transactionId,
    escrow_account_id: updated?.escrow_account_id ?? null,
    invoice_id: transaction.invoice_id ?? null,
    amount_cents: transaction.amount_cents,
    auto_release_date: autoReleaseDate.toISOString(),
    milestone_id: payload.milestone_id ?? null
  });

  return updated;
}

export async function approveRelease(
  organizationId: string,
  userId: string,
  transactionId: string,
  payload: { milestone_id?: string }
) {
  const transaction = await db
    .selectFrom('escrow_transactions')
    .innerJoin('invoices', 'invoices.id', 'escrow_transactions.invoice_id')
    .select([
      'escrow_transactions.id',
      'escrow_transactions.status',
      'escrow_transactions.amount_cents',
      'escrow_transactions.escrow_account_id',
      'escrow_transactions.invoice_id',
      'invoices.organization_id'
    ])
    .where('escrow_transactions.id', '=', transactionId)
    .executeTakeFirst();

  if (!transaction || transaction.organization_id !== organizationId) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Escrow transaction not found',
      statusCode: 404
    });
  }

  if (transaction.status !== 'release_requested') {
    throw new ApiError({
      code: ERROR_CODES.INVALID_STATE_TRANSITION,
      message: 'Release is not requested',
      statusCode: 409
    });
  }

  const updated = await db
    .updateTable('escrow_transactions')
    .set({
      status: 'released',
      release_approved_at: new Date().toISOString()
    })
    .where('id', '=', transactionId)
    .returningAll()
    .executeTakeFirst();

  await db
    .updateTable('escrow_accounts')
    .set((eb) => ({
      total_held_cents: sql`GREATEST(total_held_cents - ${transaction.amount_cents}, 0)`,
      total_released_cents: sql`total_released_cents + ${transaction.amount_cents}`
    }))
    .where('id', '=', transaction.escrow_account_id)
    .execute();

  if (payload.milestone_id) {
    await db
      .updateTable('escrow_milestones')
      .set({ status: 'released', released_at: new Date().toISOString() })
      .where('id', '=', payload.milestone_id)
      .execute();
  }

  await db.insertInto('invoice_activities').values({
    invoice_id: transaction.invoice_id,
    activity_type: 'status_changed',
    description: 'Escrow released',
    performed_by_user_id: userId
  }).execute();

  eventBus.publish('escrow.released', {
    organization_id: organizationId,
    transaction_id: transactionId,
    invoice_id: transaction.invoice_id,
    amount_cents: transaction.amount_cents,
    approved_by_user_id: userId,
    milestone_id: payload.milestone_id ?? null
  });

  return updated;
}

export async function disputeRelease(
  organizationId: string,
  userId: string,
  transactionId: string,
  payload: { reason: string }
) {
  const transaction = await db
    .selectFrom('escrow_transactions')
    .innerJoin('invoices', 'invoices.id', 'escrow_transactions.invoice_id')
    .select([
      'escrow_transactions.id',
      'escrow_transactions.status',
      'escrow_transactions.invoice_id',
      'escrow_transactions.escrow_account_id',
      'invoices.organization_id'
    ])
    .where('escrow_transactions.id', '=', transactionId)
    .executeTakeFirst();

  if (!transaction || transaction.organization_id !== organizationId) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Escrow transaction not found',
      statusCode: 404
    });
  }

  const dispute = await db
    .insertInto('escrow_disputes')
    .values({
      escrow_transaction_id: transactionId,
      initiated_by: 'client',
      initiated_by_user_id: userId,
      reason: payload.reason,
      status: 'open'
    })
    .returningAll()
    .executeTakeFirst();

  await db
    .updateTable('escrow_transactions')
    .set({ status: 'disputed' })
    .where('id', '=', transactionId)
    .execute();

  await db.insertInto('invoice_activities').values({
    invoice_id: transaction.invoice_id,
    activity_type: 'status_changed',
    description: 'Escrow disputed',
    performed_by_user_id: userId
  }).execute();

  eventBus.publish('escrow.disputed', {
    organization_id: organizationId,
    transaction_id: transactionId,
    invoice_id: transaction.invoice_id,
    reason: payload.reason,
    disputed_by_user_id: userId
  });

  return dispute;
}
