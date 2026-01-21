import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import { createMagicLink, resolveMagicLink } from '../integrations/part4.js';

export async function createPortalAccess(organizationId: string, clientId: string, payload: { access_type?: string; expires_in_days?: number }) {
  return createMagicLink({
    organization_id: organizationId,
    entity_type: 'client_portal',
    entity_id: clientId,
    expires_in_days: payload.expires_in_days,
    metadata: {
      access_type: payload.access_type ?? 'magic_link'
    }
  });
}

export async function getPortalByToken(token: string) {
  const access = await resolveMagicLink(token);

  if (!access || access.entity_type !== 'client_portal') {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Portal access not found',
      statusCode: 404
    });
  }

  const client = await db
    .selectFrom('clients')
    .select(['id', 'name', 'email'])
    .where('id', '=', access.entity_id)
    .executeTakeFirst();

  const invoices = await db
    .selectFrom('invoices')
    .selectAll()
    .where('client_id', '=', access.entity_id)
    .orderBy('created_at', 'desc')
    .execute();

  return { access, client, invoices };
}
