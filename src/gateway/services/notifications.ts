import { db } from '../db/index.js';

export async function createNotification(payload: Record<string, any>) {
  return db.insertInto('notifications').values(payload).returningAll().executeTakeFirst();
}

export async function listUnreadNotifications(organizationId: string, limit: number) {
  return db
    .selectFrom('notifications')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('read_at', 'is', null)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .execute();
}

export async function listNotificationsForUser(userId: string, limit: number, offset: number) {
  const notifications = await db
    .selectFrom('notifications')
    .selectAll()
    .where('user_id', '=', userId)
    .orderBy('created_at', 'desc')
    .limit(limit)
    .offset(offset)
    .execute();

  const unread = await db
    .selectFrom('notifications')
    .select((eb) => eb.fn.count('id').as('count'))
    .where('user_id', '=', userId)
    .where('read_at', 'is', null)
    .executeTakeFirst();

  return {
    notifications,
    unread_count: Number(unread?.count ?? 0)
  };
}

export async function markNotificationRead(notificationId: string, userId: string) {
  await db
    .updateTable('notifications')
    .set({ read_at: new Date() })
    .where('id', '=', notificationId)
    .where('user_id', '=', userId)
    .execute();
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .updateTable('notifications')
    .set({ read_at: new Date() })
    .where('user_id', '=', userId)
    .where('read_at', 'is', null)
    .execute();
}
