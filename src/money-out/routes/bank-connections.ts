import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import {
  createLinkToken,
  exchangePublicToken,
  listConnections,
  getConnection,
  reauthConnection,
  syncConnection,
  deleteConnection
} from '../services/banking.js';

export function registerBankConnectionRoutes(app: FastifyInstance) {
  app.post('/api/v1/bank-connections/link-token', async (request, reply) => {
    const linkToken = await createLinkToken(request.auth.organizationId, request.auth.userId);
    reply.send(successResponse(request.auth.requestId, linkToken));
  });

  app.post('/api/v1/bank-connections/exchange-token', async (request, reply) => {
    const bodySchema = z.object({ public_token: z.string() });
    const body = bodySchema.parse(request.body);

    const result = await exchangePublicToken(request.auth.organizationId, request.auth.userId, body.public_token);
    reply.code(201).send(
      successResponse(request.auth.requestId, {
        connection: result.connection,
        accounts: result.accounts,
        initial_sync_started: true
      }, { message: 'Bank connected successfully. Transactions will be available shortly.' })
    );
  });

  app.get('/api/v1/bank-connections', async (request, reply) => {
    const connections = await listConnections(request.auth.organizationId);
    reply.send(successResponse(request.auth.requestId, connections));
  });

  app.get('/api/v1/bank-connections/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const connection = await getConnection(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, connection));
  });

  app.post('/api/v1/bank-connections/:id/reauth', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const token = await reauthConnection(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, token));
  });

  app.post('/api/v1/bank-connections/:id/sync', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    await syncConnection(request.auth.organizationId, params.id);
    reply.send(
      successResponse(request.auth.requestId, {
        sync_started: true,
        connection_id: params.id,
        estimated_completion: new Date(Date.now() + 60000).toISOString()
      }, { message: 'Sync started. New transactions will appear shortly.' })
    );
  });

  app.delete('/api/v1/bank-connections/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({ keep_transactions: z.coerce.boolean().optional().default(true) });

    const params = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    const result = await deleteConnection(request.auth.organizationId, params.id, query.keep_transactions);
    reply.send(successResponse(request.auth.requestId, result));
  });
}
