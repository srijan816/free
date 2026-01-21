import { FastifyInstance } from 'fastify';
import { syncConnection } from '../services/banking.js';
import { db } from '../db/index.js';

export function registerWebhookRoutes(app: FastifyInstance) {
  app.post('/webhooks/plaid', async (request, reply) => {
    const body = request.body as any;
    const { webhook_type, webhook_code, item_id, error } = body ?? {};

    const connection = item_id
      ? await db.selectFrom('bank_connections').selectAll().where('plaid_item_id', '=', item_id).executeTakeFirst()
      : null;

    if (!connection) {
      reply.status(200).send('OK');
      return;
    }

    if (webhook_type === 'TRANSACTIONS' || webhook_type === 'SYNC_UPDATES_AVAILABLE') {
      await syncConnection(connection.organization_id, connection.id);
    }

    if (webhook_type === 'ITEM' && webhook_code === 'ERROR') {
      await db
        .updateTable('bank_connections')
        .set({
          status: 'error',
          error_code: error?.error_code ?? null,
          error_message: error?.error_message ?? null,
          requires_reauth: error?.error_code === 'ITEM_LOGIN_REQUIRED'
        })
        .where('id', '=', connection.id)
        .execute();
    }

    reply.status(200).send('OK');
  });
}
