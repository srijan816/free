import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { listVehicles, createVehicle, updateVehicle, deleteVehicle } from '../services/vehicles.js';

export function registerVehicleRoutes(app: FastifyInstance) {
  app.get('/api/v1/vehicles', async (request, reply) => {
    const vehicles = await listVehicles(request.auth.organizationId);
    reply.send(successResponse(request.auth.requestId, vehicles));
  });

  app.post('/api/v1/vehicles', async (request, reply) => {
    const bodySchema = z.object({
      name: z.string().min(1).max(255),
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.number().int().optional(),
      is_default: z.boolean().optional()
    });

    const body = bodySchema.parse(request.body);
    const vehicle = await createVehicle(request.auth.organizationId, body);
    reply.code(201).send(successResponse(request.auth.requestId, vehicle));
  });

  app.put('/api/v1/vehicles/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      name: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      year: z.number().int().optional(),
      is_default: z.boolean().optional(),
      is_active: z.boolean().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const vehicle = await updateVehicle(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, vehicle));
  });

  app.delete('/api/v1/vehicles/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const vehicle = await deleteVehicle(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, vehicle));
  });
}
