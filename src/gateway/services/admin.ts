import { db } from '../db/index.js';

export async function listOrganizations(query: { search?: string; limit?: number; offset?: number }) {
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;

  let qb = db.selectFrom('organizations').selectAll();

  if (query.search) {
    qb = qb.where((eb) =>
      eb.or([
        eb('name', 'ilike', `%${query.search}%`),
        eb('email', 'ilike', `%${query.search}%`)
      ])
    );
  }

  const [rows, countRow] = await Promise.all([
    qb.orderBy('created_at', 'desc').limit(limit).offset(offset).execute(),
    db.selectFrom('organizations').select((eb) => eb.fn.count('id').as('count')).executeTakeFirst()
  ]);

  const total = Number(countRow?.count ?? 0);

  return {
    organizations: rows,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + rows.length < total
    }
  };
}

export async function listUsers(query: { organization_id?: string; limit?: number; offset?: number }) {
  const limit = query.limit ?? 20;
  const offset = query.offset ?? 0;

  let qb = db.selectFrom('users').selectAll();

  if (query.organization_id) {
    qb = qb.where('organization_id', '=', query.organization_id);
  }

  const [rows, countRow] = await Promise.all([
    qb.orderBy('created_at', 'desc').limit(limit).offset(offset).execute(),
    db.selectFrom('users').select((eb) => eb.fn.count('id').as('count')).executeTakeFirst()
  ]);

  const total = Number(countRow?.count ?? 0);

  return {
    users: rows,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + rows.length < total
    }
  };
}

export async function listFeatureFlags() {
  return db.selectFrom('feature_flags').selectAll().orderBy('name').execute();
}

export async function updateFeatureFlag(name: string, payload: Record<string, any>) {
  await db.updateTable('feature_flags').set(payload).where('name', '=', name).execute();
  return db.selectFrom('feature_flags').selectAll().where('name', '=', name).executeTakeFirst();
}

export async function getAuditLogs(query: { organization_id?: string; limit?: number; offset?: number }) {
  const limit = query.limit ?? 50;
  const offset = query.offset ?? 0;

  let qb = db.selectFrom('audit_logs').selectAll();
  if (query.organization_id) {
    qb = qb.where('organization_id', '=', query.organization_id);
  }

  const [rows, countRow] = await Promise.all([
    qb.orderBy('timestamp', 'desc').limit(limit).offset(offset).execute(),
    db.selectFrom('audit_logs').select((eb) => eb.fn.count('id').as('count')).executeTakeFirst()
  ]);

  const total = Number(countRow?.count ?? 0);

  return {
    logs: rows,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + rows.length < total
    }
  };
}
