import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import {
  listVendors,
  createVendor,
  getVendor,
  updateVendor,
  deleteVendor,
  mergeVendors,
  searchVendors
} from '../services/vendors.js';

export function registerVendorRoutes(app: FastifyInstance) {
  app.get('/api/v1/vendors', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      search: z.string().optional(),
      is_active: z.coerce.boolean().optional(),
      is_1099_vendor: z.coerce.boolean().optional(),
      has_expenses: z.coerce.boolean().optional(),
      sort: z.string().optional()
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listVendors(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      search: query.search,
      is_active: query.is_active,
      is_1099_vendor: query.is_1099_vendor,
      has_expenses: query.has_expenses,
      sort: query.sort
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage)
      })
    );
  });

  app.post('/api/v1/vendors', async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1).max(255),
      display_name: z.string().max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(50).optional(),
      website: z.string().url().optional(),
      address_line1: z.string().max(255).optional(),
      address_line2: z.string().max(255).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      postal_code: z.string().max(20).optional(),
      country: z.string().length(2).optional(),
      default_category_id: z.string().uuid().optional(),
      default_payment_method: z.string().optional(),
      tax_id: z.string().max(50).optional(),
      is_1099_vendor: z.boolean().optional(),
      bank_merchant_names: z.array(z.string()).optional(),
      notes: z.string().optional()
    });

    const body = bodySchema.parse(request.body);
    const vendor = await createVendor(request.auth.organizationId, body);
    reply.code(201).send(successResponse(request.auth.requestId, vendor));
  });

  app.get('/api/v1/vendors/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({ include: z.string().optional() });

    const params = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);
    const include = new Set((query.include ?? '').split(',').map((value) => value.trim()).filter(Boolean));

    const vendor = await getVendor(request.auth.organizationId, params.id, {
      includeExpenses: include.has('expenses'),
      includeAliases: include.has('aliases')
    });

    reply.send(successResponse(request.auth.requestId, vendor));
  });

  app.put('/api/v1/vendors/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      display_name: z.string().max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().max(50).optional(),
      website: z.string().url().optional(),
      address_line1: z.string().max(255).optional(),
      address_line2: z.string().max(255).optional(),
      city: z.string().max(100).optional(),
      state: z.string().max(100).optional(),
      postal_code: z.string().max(20).optional(),
      country: z.string().length(2).optional(),
      default_category_id: z.string().uuid().optional(),
      default_payment_method: z.string().optional(),
      tax_id: z.string().max(50).optional(),
      is_1099_vendor: z.boolean().optional(),
      bank_merchant_names: z.array(z.string()).optional(),
      notes: z.string().optional(),
      is_active: z.boolean().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const vendor = await updateVendor(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, vendor));
  });

  app.delete('/api/v1/vendors/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const result = await deleteVendor(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/vendors/:id/merge', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({ merge_vendor_id: z.string().uuid() });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await mergeVendors(request.auth.organizationId, params.id, body.merge_vendor_id);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.get('/api/v1/vendors/search', async (request, reply) => {
    const querySchema = z.object({
      q: z.string().min(2),
      limit: z.coerce.number().optional().default(10)
    });

    const query = querySchema.parse(request.query);
    const result = await searchVendors(request.auth.organizationId, query.q, query.limit);
    reply.send(successResponse(request.auth.requestId, result));
  });
}
