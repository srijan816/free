import { sql } from 'kysely';
import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';

export async function listVehicles(organizationId: string) {
  const vehicles = await db
    .selectFrom('vehicles')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .execute();

  const stats = await db
    .selectFrom('mileage_entries')
    .select([
      'vehicle_id',
      sql<number>`sum(distance_miles)`.as('total_miles'),
      sql<number>`count(*)`.as('total_trips')
    ])
    .where('organization_id', '=', organizationId)
    .groupBy('vehicle_id')
    .execute();

  return vehicles.map((vehicle: any) => {
    const stat = stats.find((row: any) => row.vehicle_id === vehicle.id);
    return {
      ...vehicle,
      total_miles: Number(stat?.total_miles ?? 0),
      total_trips: Number(stat?.total_trips ?? 0)
    };
  });
}

export async function createVehicle(organizationId: string, payload: Record<string, any>) {
  if (payload.is_default) {
    await db
      .updateTable('vehicles')
      .set({ is_default: false })
      .where('organization_id', '=', organizationId)
      .execute();
  }

  const created = await db
    .insertInto('vehicles')
    .values({
      organization_id: organizationId,
      name: payload.name,
      make: payload.make ?? null,
      model: payload.model ?? null,
      year: payload.year ?? null,
      is_default: payload.is_default ?? false,
      is_active: true
    })
    .returningAll()
    .executeTakeFirst();

  return created;
}

export async function updateVehicle(organizationId: string, vehicleId: string, updates: Record<string, any>) {
  if (updates.is_default) {
    await db
      .updateTable('vehicles')
      .set({ is_default: false })
      .where('organization_id', '=', organizationId)
      .execute();
  }

  const updated = await db
    .updateTable('vehicles')
    .set({
      name: updates.name,
      make: updates.make,
      model: updates.model,
      year: updates.year,
      is_default: updates.is_default,
      is_active: updates.is_active
    })
    .where('organization_id', '=', organizationId)
    .where('id', '=', vehicleId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Vehicle not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function deleteVehicle(organizationId: string, vehicleId: string) {
  const updated = await db
    .updateTable('vehicles')
    .set({ is_active: false })
    .where('organization_id', '=', organizationId)
    .where('id', '=', vehicleId)
    .returning(['id', 'is_active'])
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Vehicle not found',
      statusCode: 404
    });
  }

  return updated;
}
