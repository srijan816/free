import { db } from '../db/index.js';

export async function createSession(payload: Record<string, any>) {
  return db.insertInto('sessions').values(payload).returningAll().executeTakeFirst();
}

export async function findSessionByUserAndToken(userId: string, tokenHash: string) {
  return db
    .selectFrom('sessions')
    .selectAll()
    .where('user_id', '=', userId)
    .where('refresh_token_hash', '=', tokenHash)
    .where('is_active', '=', true)
    .executeTakeFirst();
}

export async function updateSession(sessionId: string, payload: Record<string, any>) {
  return db.updateTable('sessions').set(payload).where('id', '=', sessionId).returningAll().executeTakeFirst();
}

export async function revokeSessionByToken(userId: string, tokenHash: string) {
  await db
    .updateTable('sessions')
    .set({
      is_active: false,
      revoked_at: new Date(),
      revoked_reason: 'logout'
    })
    .where('user_id', '=', userId)
    .where('refresh_token_hash', '=', tokenHash)
    .execute();
}

export async function revokeAllSessions(userId: string) {
  await db
    .updateTable('sessions')
    .set({
      is_active: false,
      revoked_at: new Date(),
      revoked_reason: 'logout_all'
    })
    .where('user_id', '=', userId)
    .execute();
}
