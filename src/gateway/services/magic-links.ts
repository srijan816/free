import crypto from 'node:crypto';
import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function createMagicLink(params: {
  organization_id: string;
  entity_type: string;
  entity_id: string;
  created_by_user_id?: string | null;
  expires_in_days?: number;
  max_uses?: number;
  metadata?: Record<string, any>;
}) {
  const token = crypto.randomUUID().replace(/-/g, '');
  const tokenHash = hashToken(token);
  const expiresAt = new Date();
  expiresAt.setUTCDate(expiresAt.getUTCDate() + (params.expires_in_days ?? 30));

  const link = await db
    .insertInto('magic_links')
    .values({
      organization_id: params.organization_id,
      entity_type: params.entity_type,
      entity_id: params.entity_id,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      created_by_user_id: params.created_by_user_id ?? null,
      max_uses: params.max_uses ?? null,
      metadata: params.metadata ?? {}
    })
    .returningAll()
    .executeTakeFirst();

  if (!link) {
    throw new ApiError({
      code: ERROR_CODES.INTERNAL_ERROR,
      message: 'Failed to create magic link',
      statusCode: 500
    });
  }

  return {
    id: link.id,
    token,
    entity_type: link.entity_type,
    entity_id: link.entity_id,
    expires_at: link.expires_at,
    max_uses: link.max_uses
  };
}

export async function resolveMagicLink(token: string) {
  const tokenHash = hashToken(token);
  const link = await db
    .selectFrom('magic_links')
    .selectAll()
    .where('token_hash', '=', tokenHash)
    .where('revoked_at', 'is', null)
    .executeTakeFirst();

  if (!link) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Magic link not found',
      statusCode: 404
    });
  }

  if (link.expires_at && new Date(link.expires_at) < new Date()) {
    throw new ApiError({
      code: ERROR_CODES.TOKEN_EXPIRED,
      message: 'Magic link expired',
      statusCode: 401
    });
  }

  if (link.max_uses && Number(link.access_count ?? 0) >= Number(link.max_uses)) {
    throw new ApiError({
      code: ERROR_CODES.UNAUTHORIZED,
      message: 'Magic link usage limit reached',
      statusCode: 401
    });
  }

  await db
    .updateTable('magic_links')
    .set({
      access_count: Number(link.access_count ?? 0) + 1,
      last_accessed_at: new Date().toISOString()
    })
    .where('id', '=', link.id)
    .execute();

  return link;
}
