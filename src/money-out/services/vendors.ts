import { sql } from 'kysely';
import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { calculateMatchScore, cleanMerchantName } from '../utils/vendor-matching.js';

interface ListVendorOptions {
  page: number;
  perPage: number;
  search?: string;
  is_active?: boolean;
  is_1099_vendor?: boolean;
  has_expenses?: boolean;
  sort?: string;
}

export async function listVendors(organizationId: string, options: ListVendorOptions) {
  let query = db
    .selectFrom('vendors')
    .select([
      'id',
      'name',
      'display_name',
      'default_category_id',
      'is_1099_vendor',
      'total_spent_cents',
      'expense_count',
      'last_expense_date',
      'is_active'
    ])
    .where('organization_id', '=', organizationId);

  if (options.search) {
    const search = `%${options.search.toLowerCase()}%`;
    query = query.where((eb) =>
      eb.or([
        eb('name', 'ilike', search),
        eb('display_name', 'ilike', search)
      ])
    );
  }

  if (options.is_active != null) {
    query = query.where('is_active', '=', options.is_active);
  }

  if (options.is_1099_vendor != null) {
    query = query.where('is_1099_vendor', '=', options.is_1099_vendor);
  }

  if (options.has_expenses) {
    query = query.where('expense_count', '>', 0);
  }

  const countRow = await query
    .select((eb) => eb.fn.count('id').as('total'))
    .executeTakeFirst();
  const total = Number(countRow?.total ?? 0);

  const sortMap: Record<string, string> = {
    name: 'name',
    total_spent_cents: 'total_spent_cents',
    expense_count: 'expense_count',
    last_expense_date: 'last_expense_date'
  };

  const sortKey = options.sort?.replace('-', '') ?? 'name';
  const sortColumn = sortMap[sortKey] ?? 'name';
  const sortDirection = options.sort?.startsWith('-') ? 'desc' : 'asc';

  const data = await query
    .orderBy(sortColumn as never, sortDirection as never)
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage)
    .execute();

  return { data, total };
}

export async function createVendor(organizationId: string, payload: Record<string, any>) {
  const inserted = await db
    .insertInto('vendors')
    .values({
      organization_id: organizationId,
      name: payload.name,
      display_name: payload.display_name ?? null,
      email: payload.email ?? null,
      phone: payload.phone ?? null,
      website: payload.website ?? null,
      address_line1: payload.address_line1 ?? null,
      address_line2: payload.address_line2 ?? null,
      city: payload.city ?? null,
      state: payload.state ?? null,
      postal_code: payload.postal_code ?? null,
      country: payload.country ?? null,
      default_category_id: payload.default_category_id ?? null,
      default_payment_method: payload.default_payment_method ?? null,
      tax_id: payload.tax_id ?? null,
      is_1099_vendor: payload.is_1099_vendor ?? false,
      bank_merchant_names: payload.bank_merchant_names ?? [],
      notes: payload.notes ?? null
    })
    .returningAll()
    .executeTakeFirst();

  return inserted;
}

export async function getVendor(organizationId: string, vendorId: string, options: {
  includeExpenses?: boolean;
  includeAliases?: boolean;
}) {
  const vendor = await db
    .selectFrom('vendors')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', vendorId)
    .executeTakeFirst();

  if (!vendor) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Vendor not found',
      statusCode: 404
    });
  }

  const result: Record<string, any> = { ...vendor };

  if (options.includeAliases) {
    result.aliases = await db
      .selectFrom('vendor_aliases')
      .select(['id', 'alias', 'source'])
      .where('vendor_id', '=', vendorId)
      .execute();
  }

  if (options.includeExpenses) {
    result.recent_expenses = await db
      .selectFrom('expenses')
      .select(['id', 'description', 'amount_cents', 'date'])
      .where('vendor_id', '=', vendorId)
      .where('deleted_at', 'is', null)
      .orderBy('date', 'desc')
      .limit(10)
      .execute();
  }

  return result;
}

export async function updateVendor(organizationId: string, vendorId: string, updates: Record<string, any>) {
  const updated = await db
    .updateTable('vendors')
    .set({
      display_name: updates.display_name,
      email: updates.email,
      phone: updates.phone,
      website: updates.website,
      address_line1: updates.address_line1,
      address_line2: updates.address_line2,
      city: updates.city,
      state: updates.state,
      postal_code: updates.postal_code,
      country: updates.country,
      default_category_id: updates.default_category_id,
      default_payment_method: updates.default_payment_method,
      tax_id: updates.tax_id,
      is_1099_vendor: updates.is_1099_vendor,
      bank_merchant_names: updates.bank_merchant_names,
      notes: updates.notes,
      is_active: updates.is_active
    })
    .where('organization_id', '=', organizationId)
    .where('id', '=', vendorId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Vendor not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function deleteVendor(organizationId: string, vendorId: string) {
  const updated = await db
    .updateTable('vendors')
    .set({ is_active: false })
    .where('organization_id', '=', organizationId)
    .where('id', '=', vendorId)
    .returning(['id', 'is_active'])
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Vendor not found',
      statusCode: 404
    });
  }

  await db
    .updateTable('expenses')
    .set({ vendor_id: null })
    .where('vendor_id', '=', vendorId)
    .execute();

  return updated;
}

export async function mergeVendors(organizationId: string, vendorId: string, mergeVendorId: string) {
  const [target, toMerge] = await Promise.all([
    db.selectFrom('vendors').selectAll().where('organization_id', '=', organizationId).where('id', '=', vendorId).executeTakeFirst(),
    db.selectFrom('vendors').selectAll().where('organization_id', '=', organizationId).where('id', '=', mergeVendorId).executeTakeFirst()
  ]);

  if (!target || !toMerge) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Vendor not found',
      statusCode: 404
    });
  }

  await db
    .updateTable('expenses')
    .set({
      vendor_id: target.id,
      vendor_name: target.display_name || target.name
    })
    .where('vendor_id', '=', toMerge.id)
    .execute();

  await db
    .updateTable('vendors')
    .set({
      merged_into_id: target.id,
      is_active: false
    })
    .where('id', '=', toMerge.id)
    .execute();

  if (toMerge.name) {
    await db
      .insertInto('vendor_aliases')
      .values({
        vendor_id: target.id,
        alias: toMerge.name,
        source: 'manual'
      })
      .onConflict((oc) => oc.columns(['vendor_id', 'alias']).doNothing())
      .execute();
  }

  const expensesUpdated = await db
    .selectFrom('expenses')
    .select(sql<number>`count(*)`.as('count'))
    .where('vendor_id', '=', target.id)
    .executeTakeFirst();

  return {
    id: target.id,
    name: target.name,
    merged_vendor: {
      id: toMerge.id,
      name: toMerge.name,
      merged_into_id: target.id
    },
    expenses_updated: Number(expensesUpdated?.count ?? 0),
    aliases_added: 1
  };
}

export async function searchVendors(organizationId: string, query: string, limit: number) {
  const search = `%${query.toLowerCase()}%`;
  return db
    .selectFrom('vendors')
    .select(['id', 'name', 'display_name', 'default_category_id'])
    .where('organization_id', '=', organizationId)
    .where((eb) => eb.or([eb('name', 'ilike', search), eb('display_name', 'ilike', search)]))
    .orderBy('name', 'asc')
    .limit(limit)
    .execute();
}

export async function findOrCreateVendorFromMerchant(organizationId: string, merchantName: string) {
  const cleaned = cleanMerchantName(merchantName);
  const vendors = await db
    .selectFrom('vendors')
    .select(['id', 'name', 'display_name', 'bank_merchant_names', 'default_category_id'])
    .where('organization_id', '=', organizationId)
    .where('is_active', '=', true)
    .execute();

  let bestVendor: any = null;
  let bestScore = 0;

  for (const vendor of vendors as any[]) {
    const score = calculateMatchScore(cleaned, vendor);
    if (score > bestScore) {
      bestScore = score;
      bestVendor = vendor;
    }
  }

  if (bestVendor && bestScore >= 80) {
    return bestVendor;
  }

  const created = await db
    .insertInto('vendors')
    .values({
      organization_id: organizationId,
      name: cleaned,
      display_name: cleaned,
      bank_merchant_names: [merchantName]
    })
    .returningAll()
    .executeTakeFirst();

  return created;
}
