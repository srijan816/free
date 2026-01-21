import { sql } from 'kysely';
import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { MILEAGE_RATES } from '../utils/constants.js';
import { calculateMileageDeduction, getMileageRateCents } from '../utils/mileage.js';

interface ListMileageOptions {
  page: number;
  perPage: number;
  date_from?: string;
  date_to?: string;
  purpose?: string;
  vehicle_id?: string;
  is_billable?: boolean;
  client_id?: string;
}

export async function listMileageEntries(organizationId: string, options: ListMileageOptions) {
  let query = db
    .selectFrom('mileage_entries')
    .leftJoin('vehicles', 'vehicles.id', 'mileage_entries.vehicle_id')
    .select([
      'mileage_entries.id',
      'mileage_entries.date',
      'mileage_entries.description',
      'mileage_entries.start_location',
      'mileage_entries.end_location',
      'mileage_entries.distance_miles',
      'mileage_entries.purpose',
      'mileage_entries.trip_category',
      'mileage_entries.rate_type',
      'mileage_entries.rate_per_mile_cents',
      'mileage_entries.deduction_cents',
      'mileage_entries.is_billable',
      'mileage_entries.client_id',
      'vehicles.id as vehicle_id',
      'vehicles.name as vehicle_name'
    ])
    .where('mileage_entries.organization_id', '=', organizationId);

  if (options.date_from) {
    query = query.where('mileage_entries.date', '>=', options.date_from);
  }

  if (options.date_to) {
    query = query.where('mileage_entries.date', '<=', options.date_to);
  }

  if (options.purpose) {
    query = query.where('mileage_entries.purpose', '=', options.purpose);
  }

  if (options.vehicle_id) {
    query = query.where('mileage_entries.vehicle_id', '=', options.vehicle_id);
  }

  if (options.is_billable != null) {
    query = query.where('mileage_entries.is_billable', '=', options.is_billable);
  }

  if (options.client_id) {
    query = query.where('mileage_entries.client_id', '=', options.client_id);
  }

  const countRow = await query
    .select((eb) => eb.fn.count('mileage_entries.id').as('total'))
    .executeTakeFirst();
  const total = Number(countRow?.total ?? 0);

  const data = await query
    .orderBy('mileage_entries.date', 'desc')
    .limit(options.perPage)
    .offset((options.page - 1) * options.perPage)
    .execute();

  const summaryRow = await db
    .selectFrom('mileage_entries')
    .select((eb) => [
      eb.fn.coalesce(eb.fn.sum('distance_miles'), eb.val(0)).as('total_miles'),
      eb.fn.coalesce(eb.fn.sum('deduction_cents'), eb.val(0)).as('total_deduction_cents')
    ])
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();

  const byPurposeRows = await db
    .selectFrom('mileage_entries')
    .select((eb) => [
      'purpose',
      eb.fn.coalesce(eb.fn.sum('distance_miles'), eb.val(0)).as('miles'),
      eb.fn.coalesce(eb.fn.sum('deduction_cents'), eb.val(0)).as('deduction_cents')
    ])
    .where('organization_id', '=', organizationId)
    .groupBy('purpose')
    .execute();

  const byPurpose = byPurposeRows.reduce<Record<string, any>>((acc, row: any) => {
    acc[row.purpose] = {
      miles: Number(row.miles ?? 0),
      deduction_cents: Number(row.deduction_cents ?? 0)
    };
    return acc;
  }, {});

  return {
    data,
    total,
    summary: {
      total_miles: Number(summaryRow?.total_miles ?? 0),
      total_deduction_cents: Number(summaryRow?.total_deduction_cents ?? 0),
      by_purpose: byPurpose
    }
  };
}

export async function createMileageEntry(organizationId: string, payload: Record<string, any>) {
  const ratePerMileCents = payload.rate_type === 'actual'
    ? payload.rate_per_mile_cents
    : getMileageRateCents(payload.date, payload.purpose ?? 'business');
  const deductionCents = calculateMileageDeduction(payload.distance_miles, ratePerMileCents);

  const created = await db
    .insertInto('mileage_entries')
    .values({
      organization_id: organizationId,
      date: payload.date,
      description: payload.description,
      start_location: payload.start_location ?? null,
      end_location: payload.end_location ?? null,
      distance_miles: payload.distance_miles,
      purpose: payload.purpose ?? 'business',
      trip_category: payload.trip_category ?? null,
      rate_type: payload.rate_type ?? 'standard',
      rate_per_mile_cents: ratePerMileCents,
      deduction_cents: deductionCents,
      is_billable: payload.is_billable ?? false,
      client_id: payload.client_id ?? null,
      invoice_id: null,
      vehicle_id: payload.vehicle_id ?? null,
      odometer_start: payload.odometer_start ?? null,
      odometer_end: payload.odometer_end ?? null,
      notes: payload.notes ?? null
    })
    .returningAll()
    .executeTakeFirst();

  return created;
}

export async function updateMileageEntry(organizationId: string, entryId: string, updates: Record<string, any>) {
  const existing = await db
    .selectFrom('mileage_entries')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('id', '=', entryId)
    .executeTakeFirst();

  if (!existing) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Mileage entry not found',
      statusCode: 404
    });
  }

  const date = updates.date ?? existing.date;
  const ratePerMileCents = updates.rate_type === 'actual'
    ? updates.rate_per_mile_cents ?? existing.rate_per_mile_cents
    : getMileageRateCents(date, updates.purpose ?? existing.purpose);
  const distance = updates.distance_miles ?? existing.distance_miles;
  const deductionCents = calculateMileageDeduction(distance, ratePerMileCents);

  const updated = await db
    .updateTable('mileage_entries')
    .set({
      date: updates.date,
      description: updates.description,
      start_location: updates.start_location,
      end_location: updates.end_location,
      distance_miles: updates.distance_miles,
      purpose: updates.purpose,
      trip_category: updates.trip_category,
      rate_type: updates.rate_type,
      rate_per_mile_cents: ratePerMileCents,
      deduction_cents: deductionCents,
      is_billable: updates.is_billable,
      client_id: updates.client_id,
      vehicle_id: updates.vehicle_id,
      odometer_start: updates.odometer_start,
      odometer_end: updates.odometer_end,
      notes: updates.notes
    })
    .where('id', '=', entryId)
    .returningAll()
    .executeTakeFirst();

  return updated;
}

export async function deleteMileageEntry(organizationId: string, entryId: string) {
  const deleted = await db
    .deleteFrom('mileage_entries')
    .where('organization_id', '=', organizationId)
    .where('id', '=', entryId)
    .executeTakeFirst();

  if (!deleted) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Mileage entry not found',
      statusCode: 404
    });
  }

  return { id: entryId, deleted: true };
}

export async function getMileageSummary(organizationId: string, year: number) {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const rows = await db
    .selectFrom('mileage_entries')
    .select((eb) => [
      'purpose',
      eb.fn.coalesce(eb.fn.sum('distance_miles'), eb.val(0)).as('miles'),
      eb.fn.coalesce(eb.fn.sum('deduction_cents'), eb.val(0)).as('deduction_cents'),
      eb.fn.count('id').as('trip_count')
    ])
    .where('organization_id', '=', organizationId)
    .where('date', '>=', start)
    .where('date', '<=', end)
    .groupBy('purpose')
    .execute();

  const totals = rows.reduce(
    (acc, row: any) => {
      acc.total_miles += Number(row.miles ?? 0);
      acc.total_deduction_cents += Number(row.deduction_cents ?? 0);
      return acc;
    },
    { total_miles: 0, total_deduction_cents: 0 }
  );

  const byPurpose = rows.reduce<Record<string, any>>((acc, row: any) => {
    acc[row.purpose] = {
      miles: Number(row.miles ?? 0),
      deduction_cents: Number(row.deduction_cents ?? 0),
      trip_count: Number(row.trip_count ?? 0)
    };
    return acc;
  }, {});

  const byMonth = await db
    .selectFrom('mileage_entries')
    .select((eb) => [
      sql<number>`EXTRACT(MONTH FROM date)`.as('month'),
      eb.fn.coalesce(eb.fn.sum('distance_miles'), eb.val(0)).as('miles'),
      eb.fn.coalesce(eb.fn.sum('deduction_cents'), eb.val(0)).as('deduction_cents')
    ])
    .where('organization_id', '=', organizationId)
    .where('date', '>=', start)
    .where('date', '<=', end)
    .groupBy('month')
    .orderBy('month')
    .execute();

  const billable = await db
    .selectFrom('mileage_entries')
    .select((eb) => [
      eb.fn.coalesce(eb.fn.sum('distance_miles'), eb.val(0)).as('total_miles'),
      eb.fn.coalesce(eb.fn.sum('deduction_cents'), eb.val(0)).as('total_deduction_cents')
    ])
    .where('organization_id', '=', organizationId)
    .where('is_billable', '=', true)
    .where('invoice_id', 'is', null)
    .executeTakeFirst();

  const yearRates = (MILEAGE_RATES as any)[String(year)] ?? (MILEAGE_RATES as any)['2026'];

  return {
    year,
    total_miles: totals.total_miles,
    total_deduction_cents: totals.total_deduction_cents,
    by_purpose: byPurpose,
    by_month: byMonth.map((row: any) => ({
      month: Number(row.month),
      miles: Number(row.miles ?? 0),
      deduction_cents: Number(row.deduction_cents ?? 0)
    })),
    billable: {
      total_miles: Number(billable?.total_miles ?? 0),
      unbilled_miles: Number(billable?.total_miles ?? 0),
      unbilled_amount_cents: Number(billable?.total_deduction_cents ?? 0)
    },
    rate_used: {
      business: Math.round(yearRates.business * 100),
      medical: Math.round(yearRates.medical * 100),
      charity: Math.round(yearRates.charity * 100)
    }
  };
}
