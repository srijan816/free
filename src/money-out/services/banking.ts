import { db } from '../db/index.js';
import { plaidService } from '../integrations/plaid.js';
import { processTransactions } from './transactions.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { eventBus } from '../integrations/event-bus.js';

export async function createLinkToken(organizationId: string, userId: string) {
  return plaidService.createLinkToken({
    organization_id: organizationId,
    user_id: userId,
    products: ['transactions']
  });
}

export async function exchangePublicToken(organizationId: string, userId: string, publicToken: string) {
  const response = await plaidService.exchangePublicToken({
    public_token: publicToken,
    organization_id: organizationId,
    user_id: userId
  });

  const connection = await db
    .insertInto('bank_connections')
    .values({
      organization_id: organizationId,
      plaid_item_id: response.item_id,
      plaid_access_token: response.access_token,
      institution_id: response.institution_id,
      institution_name: response.institution_name,
      institution_logo_url: response.institution_logo_url ?? null,
      institution_color: response.institution_color ?? null,
      status: 'connected',
      requires_reauth: false,
      connected_by_user_id: userId
    })
    .returningAll()
    .executeTakeFirst();

  if (!connection) {
    throw new ApiError({
      code: ERROR_CODES.BANK_CONNECTION_FAILED,
      message: 'Failed to create bank connection',
      statusCode: 500
    });
  }

  const accounts = [] as any[];
  for (const account of response.accounts) {
    const inserted = await db
      .insertInto('bank_accounts')
      .values({
        organization_id: organizationId,
        bank_connection_id: connection.id,
        plaid_account_id: account.account_id,
        name: account.name,
        official_name: account.official_name ?? null,
        type: account.type,
        subtype: account.subtype ?? null,
        mask: account.mask ?? null,
        current_balance_cents: account.balances.current ? Math.round(account.balances.current * 100) : null,
        available_balance_cents: account.balances.available ? Math.round(account.balances.available * 100) : null,
        balance_currency: account.balances.iso_currency_code ?? 'USD',
        balance_updated_at: new Date().toISOString(),
        is_active: true,
        is_visible: true
      })
      .returningAll()
      .executeTakeFirst();

    if (inserted) accounts.push(inserted);
  }

  eventBus.publish('bank.connected', {
    connection_id: connection.id,
    organization_id: organizationId,
    institution_name: connection.institution_name,
    account_count: accounts.length
  });

  return { connection, accounts };
}

export async function listConnections(organizationId: string) {
  const connections = await db
    .selectFrom('bank_connections')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .execute();

  const accounts = await db
    .selectFrom('bank_accounts')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .execute();

  return connections.map((connection: any) => ({
    ...connection,
    accounts: accounts.filter((account: any) => account.bank_connection_id === connection.id)
  }));
}

export async function getConnection(organizationId: string, connectionId: string) {
  const connection = await db
    .selectFrom('bank_connections')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', connectionId)
    .executeTakeFirst();

  if (!connection) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Bank connection not found',
      statusCode: 404
    });
  }

  const accounts = await db
    .selectFrom('bank_accounts')
    .selectAll()
    .where('bank_connection_id', '=', connectionId)
    .execute();

  return {
    ...connection,
    accounts,
    sync_history: [] as any[]
  };
}

export async function reauthConnection(organizationId: string, connectionId: string) {
  const connection = await db
    .selectFrom('bank_connections')
    .select(['plaid_item_id'])
    .where('organization_id', '=', organizationId)
    .where('id', '=', connectionId)
    .executeTakeFirst();

  if (!connection) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Bank connection not found',
      statusCode: 404
    });
  }

  return plaidService.createUpdateLinkToken(connection.plaid_item_id);
}

export async function syncConnection(organizationId: string, connectionId: string) {
  const connection = await db
    .selectFrom('bank_connections')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', connectionId)
    .executeTakeFirst();

  if (!connection) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Bank connection not found',
      statusCode: 404
    });
  }

  const accounts = await db
    .selectFrom('bank_accounts')
    .selectAll()
    .where('bank_connection_id', '=', connectionId)
    .execute();

  let totalAdded = 0;
  let totalModified = 0;
  let totalRemoved = 0;

  try {
    const syncResult = await plaidService.syncTransactions(connection.plaid_access_token, connection.last_cursor ?? undefined);
    for (const account of accounts as any[]) {
      if (!account.is_active) continue;
      const processResult = await processTransactions(syncResult.added, {
        ...account,
        organization_id: organizationId,
        connected_by_user_id: connection.connected_by_user_id
      });
      totalAdded += processResult.processed;
    }

    await db
      .updateTable('bank_connections')
      .set({
        last_cursor: syncResult.next_cursor,
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'success',
        requires_reauth: false
      })
      .where('id', '=', connectionId)
      .execute();

    eventBus.publish('bank.sync_completed', {
      connection_id: connectionId,
      organization_id: organizationId,
      transactions_added: totalAdded,
      transactions_modified: totalModified,
      transactions_removed: totalRemoved
    });

    return {
      added: totalAdded,
      modified: totalModified,
      removed: totalRemoved
    };
  } catch (error: any) {
    const errorCode = error?.code || error?.error_code;
    const requiresReauth = errorCode === 'ITEM_LOGIN_REQUIRED' || errorCode === 'ITEM_LOGIN_INVALID';

    await db
      .updateTable('bank_connections')
      .set({
        last_sync_at: new Date().toISOString(),
        last_sync_status: 'failed',
        requires_reauth: requiresReauth
      })
      .where('id', '=', connectionId)
      .execute();

    eventBus.publish('bank.sync_failed', {
      connection_id: connectionId,
      organization_id: organizationId,
      error_code: errorCode ?? 'sync_failed',
      error_message: error?.message ?? 'Bank sync failed',
      retry_in_ms: requiresReauth ? 60 * 60 * 1000 : 15 * 60 * 1000
    });

    throw error;
  }
}

export async function deleteConnection(organizationId: string, connectionId: string, keepTransactions: boolean) {
  const accounts = await db
    .selectFrom('bank_accounts')
    .select(['id'])
    .where('bank_connection_id', '=', connectionId)
    .execute();

  if (!keepTransactions) {
    await db
      .deleteFrom('bank_transactions')
      .where('bank_account_id', 'in', accounts.map((account: any) => account.id) as any)
      .execute();
  }

  await db
    .deleteFrom('bank_accounts')
    .where('bank_connection_id', '=', connectionId)
    .execute();

  await db
    .deleteFrom('bank_connections')
    .where('organization_id', '=', organizationId)
    .where('id', '=', connectionId)
    .execute();

  eventBus.publish('bank.disconnected', {
    connection_id: connectionId,
    organization_id: organizationId,
    reason: 'user_deleted'
  });

  return {
    id: connectionId,
    deleted: true,
    transactions_preserved: keepTransactions,
    accounts_removed: accounts.length
  };
}

export async function updateBankAccount(organizationId: string, accountId: string, updates: Record<string, any>) {
  const updated = await db
    .updateTable('bank_accounts')
    .set({
      nickname: updates.nickname,
      is_visible: updates.is_visible,
      default_category_id: updates.default_category_id
    })
    .where('organization_id', '=', organizationId)
    .where('id', '=', accountId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Bank account not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function getBankAccountTransactions(organizationId: string, accountId: string, options: any) {
  return db
    .selectFrom('bank_transactions')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('bank_account_id', '=', accountId)
    .execute();
}
