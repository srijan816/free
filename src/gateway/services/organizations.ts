import { db } from '../db/index.js';
import { DEFAULT_CURRENCY, DEFAULT_TIMEZONE } from '../constants/index.js';
import { createDefaultCategories } from './categories.js';

export async function createOrganization(payload: {
  name: string;
  email: string;
  currency?: string;
  timezone?: string;
}) {
  const organization = await db
    .insertInto('organizations')
    .values({
      name: payload.name,
      email: payload.email,
      currency: payload.currency ?? DEFAULT_CURRENCY,
      timezone: payload.timezone ?? DEFAULT_TIMEZONE
    })
    .returningAll()
    .executeTakeFirst();

  if (organization) {
    await createDefaultCategories(organization.id);
  }

  return organization;
}

export async function findOrganizationById(id: string) {
  return db.selectFrom('organizations').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function updateOrganization(id: string, payload: Record<string, any>) {
  return db.updateTable('organizations').set(payload).where('id', '=', id).returningAll().executeTakeFirst();
}
