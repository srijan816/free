import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import {
  listClients,
  createClient,
  getClient,
  updateClient,
  deleteClient,
  listContacts,
  createContact,
  updateContact,
  deleteContact
} from '../services/clients.js';
import { listInvoices } from '../services/invoices.js';

export function registerClientRoutes(app: FastifyInstance) {
  app.get('/api/v1/clients', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      search: z.string().optional(),
      is_active: z.coerce.boolean().optional(),
      sort: z.string().optional(),
      include_stats: z.coerce.boolean().optional().default(false)
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listClients(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      search: query.search,
      is_active: query.is_active,
      sort: query.sort,
      include_stats: query.include_stats
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage)
      })
    );
  });

  app.post('/api/v1/clients', async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1).max(255),
      email: z.string().email().max(255),
      company: z.string().max(255).optional(),
      phone: z.string().max(50).optional(),
      website: z.string().url().max(500).optional(),
      address_line1: z.string().max(255).optional(),
      address_line2: z.string().max(255).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      postal_code: z.string().max(20).optional(),
      country: z.string().length(2).optional(),
      currency: z.string().length(3).optional(),
      payment_terms_days: z.number().int().min(0).max(365).optional(),
      tax_id: z.string().max(50).optional(),
      notes: z.string().max(5000).optional(),
      tags: z.array(z.string().max(50)).max(20).optional()
    });

    const body = bodySchema.parse(request.body);
    const client = await createClient(request.auth.organizationId, body);

    reply.code(201).send(successResponse(request.auth.requestId, client));
  });

  app.get('/api/v1/clients/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({ include: z.string().optional() });
    const params = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    const include = new Set((query.include ?? '').split(',').map((value) => value.trim()).filter(Boolean));
    const client = await getClient(request.auth.organizationId, params.id, {
      includeContacts: include.has('contacts'),
      includeInvoices: include.has('recent_invoices'),
      includeStats: include.has('stats')
    });

    reply.send(successResponse(request.auth.requestId, client));
  });

  app.put('/api/v1/clients/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      name: z.string().min(1).max(255).optional(),
      email: z.string().email().max(255).optional(),
      company: z.string().max(255).optional(),
      phone: z.string().max(50).optional(),
      website: z.string().url().max(500).optional(),
      address_line1: z.string().max(255).optional(),
      address_line2: z.string().max(255).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      postal_code: z.string().max(20).optional(),
      country: z.string().length(2).optional(),
      currency: z.string().length(3).optional(),
      payment_terms_days: z.number().int().min(0).max(365).optional(),
      tax_id: z.string().max(50).optional(),
      notes: z.string().max(5000).optional(),
      tags: z.array(z.string().max(50)).max(20).optional(),
      is_active: z.boolean().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const updated = await updateClient(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.delete('/api/v1/clients/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const result = await deleteClient(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.get('/api/v1/clients/:id/invoices', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      status: z.string().optional(),
      sort: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listInvoices(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      status: query.status ? query.status.split(',') : undefined,
      client_id: params.id,
      sort: query.sort
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage),
        summary: result.summary
      })
    );
  });

  app.get('/api/v1/clients/:id/contacts', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const contacts = await listContacts(params.id);
    reply.send(successResponse(request.auth.requestId, contacts));
  });

  app.post('/api/v1/clients/:id/contacts', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      name: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      role: z.string().optional(),
      is_primary: z.boolean().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const contact = await createContact(params.id, body);
    reply.code(201).send(successResponse(request.auth.requestId, contact));
  });

  app.put('/api/v1/clients/:client_id/contacts/:id', async (request, reply) => {
    const paramsSchema = z.object({ client_id: z.string().uuid(), id: z.string().uuid() });
    const bodySchema = z.object({
      name: z.string().min(1).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      role: z.string().optional(),
      is_primary: z.boolean().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const contact = await updateContact(params.client_id, params.id, body);
    reply.send(successResponse(request.auth.requestId, contact));
  });

  app.delete('/api/v1/clients/:client_id/contacts/:id', async (request, reply) => {
    const paramsSchema = z.object({ client_id: z.string().uuid(), id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const contact = await deleteContact(params.client_id, params.id);
    reply.send(successResponse(request.auth.requestId, contact));
  });
}
