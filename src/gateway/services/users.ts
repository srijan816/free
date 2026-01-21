import { db } from '../db/index.js';

export async function findUserByEmail(email: string) {
  return db.selectFrom('users').selectAll().where('email', '=', email).executeTakeFirst();
}

export async function findUserById(id: string) {
  return db.selectFrom('users').selectAll().where('id', '=', id).executeTakeFirst();
}

export async function findUsersByOrganization(organizationId: string) {
  return db.selectFrom('users').selectAll().where('organization_id', '=', organizationId).execute();
}

export async function createUser(payload: Record<string, any>) {
  return db.insertInto('users').values(payload).returningAll().executeTakeFirst();
}

export async function updateUser(id: string, payload: Record<string, any>) {
  return db.updateTable('users').set(payload).where('id', '=', id).returningAll().executeTakeFirst();
}

export async function resetFailedAttempts(userId: string) {
  await db.updateTable('users').set({ failed_login_attempts: 0, locked_until: null }).where('id', '=', userId).execute();
}

export async function countUsersByOrganization(organizationId: string) {
  const result = await db
    .selectFrom('users')
    .select((eb) => eb.fn.count('id').as('count'))
    .where('organization_id', '=', organizationId)
    .executeTakeFirst();
  return Number(result?.count ?? 0);
}
