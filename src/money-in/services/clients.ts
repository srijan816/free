import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';

interface ListClientsOptions {
  page: number;
  perPage: number;
  search?: string;
  is_active?: boolean;
  sort?: string;
  include_stats?: boolean;
}

export async function listClients(organizationId: string, options: ListClientsOptions) {
  let baseQuery = db.selectFrom('clients').where('organization_id', '=', organizationId);

  if (options.search) {
    const search = `%${options.search.toLowerCase()}%`;
    baseQuery = baseQuery.where((eb) =>
      eb.or([
        eb('name', 'ilike', search),
        eb('email', 'ilike', search),
        eb('company', 'ilike', search)
      ])
    );
  }

  if (options.is_active !== undefined) {
    baseQuery = baseQuery.where('is_active', '=', options.is_active);
  }

  const countResult = await baseQuery
    .select((eb) => eb.fn.count('id').as('total'))
    .executeTakeFirst();

  const total = Number(countResult?.total ?? 0);

  const sortMap: Record<string, string> = {
    name: 'name',
    email: 'email',
    created_at: 'created_at'
  };

  const sortKey = options.sort?.replace('-', '') ?? 'created_at';
  const sortColumn = sortMap[sortKey] ?? 'created_at';
  const sortDirection = options.sort?.startsWith('-') ? 'desc' : 'asc';

  let query = baseQuery
    .selectAll()
    .orderBy(sortColumn as never, sortDirection as never)
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage);

  if (options.include_stats) {
    query = query
      .leftJoin('invoices', 'invoices.client_id', 'clients.id')
      .select((eb) => [
        eb.fn.coalesce(eb.fn.sum('invoices.total_cents'), eb.val(0)).as('total_invoiced_cents'),
        eb.fn.coalesce(eb.fn.sum('invoices.amount_paid_cents'), eb.val(0)).as('total_paid_cents'),
        eb.fn.coalesce(eb.fn.sum('invoices.amount_due_cents'), eb.val(0)).as('total_outstanding_cents'),
        eb.fn.count('invoices.id').as('invoice_count')
      ])
      .groupBy('clients.id');
  }

  const rows = await query.execute();

  const data = rows.map((row: any) => ({
    ...row,
    stats: options.include_stats
      ? {
          total_invoiced_cents: Number(row.total_invoiced_cents ?? 0),
          total_paid_cents: Number(row.total_paid_cents ?? 0),
          total_outstanding_cents: Number(row.total_outstanding_cents ?? 0),
          invoice_count: Number(row.invoice_count ?? 0)
        }
      : undefined
  }));

  return { data, total };
}

export async function getClient(organizationId: string, clientId: string, options: {
  includeContacts?: boolean;
  includeInvoices?: boolean;
  includeStats?: boolean;
}) {
  const client = await db
    .selectFrom('clients')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', clientId)
    .executeTakeFirst();

  if (!client) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Client not found',
      statusCode: 404
    });
  }

  const result: Record<string, any> = { ...client };

  if (options.includeContacts) {
    result.contacts = await db
      .selectFrom('client_contacts')
      .selectAll()
      .where('client_id', '=', clientId)
      .orderBy('is_primary', 'desc')
      .orderBy('created_at', 'asc')
      .execute();
  }

  if (options.includeInvoices) {
    result.recent_invoices = await db
      .selectFrom('invoices')
      .select(['id', 'invoice_number', 'status', 'total_cents', 'issue_date'])
      .where('client_id', '=', clientId)
      .orderBy('created_at', 'desc')
      .limit(10)
      .execute();
  }

  if (options.includeStats) {
    const stats = await db
      .selectFrom('invoices')
      .select((eb) => [
        eb.fn.coalesce(eb.fn.sum('total_cents'), eb.val(0)).as('total_invoiced_cents'),
        eb.fn.coalesce(eb.fn.sum('amount_paid_cents'), eb.val(0)).as('total_paid_cents'),
        eb.fn.coalesce(eb.fn.sum('amount_due_cents'), eb.val(0)).as('total_outstanding_cents'),
        eb.fn.count('id').as('invoice_count')
      ])
      .where('client_id', '=', clientId)
      .executeTakeFirst();

    result.stats = {
      total_invoiced_cents: Number(stats?.total_invoiced_cents ?? 0),
      total_paid_cents: Number(stats?.total_paid_cents ?? 0),
      total_outstanding_cents: Number(stats?.total_outstanding_cents ?? 0),
      invoice_count: Number(stats?.invoice_count ?? 0)
    };
  }

  return result;
}

export async function createClient(organizationId: string, payload: Record<string, any>) {
  const existing = await db
    .selectFrom('clients')
    .select(['id'])
    .where('organization_id', '=', organizationId)
    .where('email', '=', payload.email)
    .executeTakeFirst();

  if (existing) {
    throw new ApiError({
      code: ERROR_CODES.ALREADY_EXISTS,
      message: 'A client with this email already exists',
      statusCode: 409
    });
  }

  const orgDefaults = await db
    .selectFrom('organizations')
    .select(['currency'])
    .where('id', '=', organizationId)
    .executeTakeFirst();

  const insertPayload = {
    ...payload,
    organization_id: organizationId,
    currency: payload.currency ?? orgDefaults?.currency ?? 'USD',
    payment_terms_days: payload.payment_terms_days ?? 30,
    is_active: payload.is_active ?? true
  };

  const created = await db.insertInto('clients').values(insertPayload).returningAll().executeTakeFirst();

  if (!created) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create client',
      statusCode: 500
    });
  }

  return created;
}

export async function updateClient(organizationId: string, clientId: string, payload: Record<string, any>) {
  const updated = await db
    .updateTable('clients')
    .set(payload)
    .where('organization_id', '=', organizationId)
    .where('id', '=', clientId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Client not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function deleteClient(organizationId: string, clientId: string) {
  const unpaid = await db
    .selectFrom('invoices')
    .select((eb) => eb.fn.count('id').as('count'))
    .where('client_id', '=', clientId)
    .where('organization_id', '=', organizationId)
    .where('amount_due_cents', '>', 0)
    .executeTakeFirst();

  if (Number(unpaid?.count ?? 0) > 0) {
    throw new ApiError({
      code: ERROR_CODES.CONFLICT,
      message: 'Cannot delete client with unpaid invoices',
      statusCode: 409
    });
  }

  const updated = await db
    .updateTable('clients')
    .set({ is_active: false })
    .where('organization_id', '=', organizationId)
    .where('id', '=', clientId)
    .returning(['id', 'is_active'])
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Client not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function listContacts(clientId: string) {
  return db
    .selectFrom('client_contacts')
    .selectAll()
    .where('client_id', '=', clientId)
    .orderBy('is_primary', 'desc')
    .orderBy('created_at', 'asc')
    .execute();
}

export async function createContact(clientId: string, payload: Record<string, any>) {
  if (payload.is_primary) {
    await db.updateTable('client_contacts').set({ is_primary: false }).where('client_id', '=', clientId).execute();
  }

  const created = await db
    .insertInto('client_contacts')
    .values({ ...payload, client_id: clientId })
    .returningAll()
    .executeTakeFirst();

  if (!created) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create contact',
      statusCode: 500
    });
  }

  if (created.is_primary) {
    await db.updateTable('clients').set({ email: created.email }).where('id', '=', clientId).execute();
  }

  return created;
}

export async function updateContact(clientId: string, contactId: string, payload: Record<string, any>) {
  if (payload.is_primary) {
    await db.updateTable('client_contacts').set({ is_primary: false }).where('client_id', '=', clientId).execute();
  }

  const updated = await db
    .updateTable('client_contacts')
    .set(payload)
    .where('client_id', '=', clientId)
    .where('id', '=', contactId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Contact not found',
      statusCode: 404
    });
  }

  if (updated.is_primary) {
    await db.updateTable('clients').set({ email: updated.email }).where('id', '=', clientId).execute();
  }

  return updated;
}

export async function deleteContact(clientId: string, contactId: string) {
  const deleted = await db
    .deleteFrom('client_contacts')
    .where('client_id', '=', clientId)
    .where('id', '=', contactId)
    .returning(['id'])
    .executeTakeFirst();

  if (!deleted) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Contact not found',
      statusCode: 404
    });
  }

  return deleted;
}
