import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import {
  listMileageEntries,
  createMileageEntry,
  updateMileageEntry,
  deleteMileageEntry,
  getMileageSummary
} from '../services/mileage.js';

export function registerMileageRoutes(app: FastifyInstance) {
  app.get('/api/v1/mileage', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      purpose: z.string().optional(),
      vehicle_id: z.string().uuid().optional(),
      is_billable: z.coerce.boolean().optional(),
      client_id: z.string().uuid().optional()
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listMileageEntries(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      date_from: query.date_from,
      date_to: query.date_to,
      purpose: query.purpose,
      vehicle_id: query.vehicle_id,
      is_billable: query.is_billable,
      client_id: query.client_id
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage),
        summary: result.summary
      })
    );
  });

  app.post('/api/v1/mileage', async (request, reply) => {
    const bodySchema = z.object({
      date: z.string(),
      description: z.string().min(1).max(500),
      start_location: z.string().optional(),
      end_location: z.string().optional(),
      distance_miles: z.number().positive(),
      purpose: z.string().optional(),
      trip_category: z.string().optional(),
      rate_type: z.string().optional(),
      rate_per_mile_cents: z.number().int().optional(),
      is_billable: z.boolean().optional(),
      client_id: z.string().uuid().optional(),
      vehicle_id: z.string().uuid().optional(),
      odometer_start: z.number().int().optional(),
      odometer_end: z.number().int().optional(),
      notes: z.string().optional()
    });

    const body = bodySchema.parse(request.body);
    const entry = await createMileageEntry(request.auth.organizationId, body);
    reply.code(201).send(successResponse(request.auth.requestId, entry));
  });

  app.put('/api/v1/mileage/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      date: z.string().optional(),
      description: z.string().optional(),
      start_location: z.string().optional(),
      end_location: z.string().optional(),
      distance_miles: z.number().positive().optional(),
      purpose: z.string().optional(),
      trip_category: z.string().optional(),
      rate_type: z.string().optional(),
      rate_per_mile_cents: z.number().int().optional(),
      is_billable: z.boolean().optional(),
      client_id: z.string().uuid().optional(),
      vehicle_id: z.string().uuid().optional(),
      odometer_start: z.number().int().optional(),
      odometer_end: z.number().int().optional(),
      notes: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const entry = await updateMileageEntry(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, entry));
  });

  app.delete('/api/v1/mileage/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const result = await deleteMileageEntry(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.get('/api/v1/mileage/summary', async (request, reply) => {
    const querySchema = z.object({ year: z.coerce.number().optional() });
    const query = querySchema.parse(request.query);

    const year = query.year ?? new Date().getUTCFullYear();
    const result = await getMileageSummary(request.auth.organizationId, year);
    reply.send(successResponse(request.auth.requestId, result));
  });
}
