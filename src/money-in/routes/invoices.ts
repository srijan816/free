import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { successResponse } from '../utils/api-response.js';
import { getPagination, buildPaginationMeta } from '../utils/pagination.js';
import {
  listInvoices,
  createInvoice,
  getInvoice,
  updateInvoice,
  deleteInvoice,
  sendInvoice,
  sendReminder,
  duplicateInvoice,
  generatePdf,
  cancelInvoice,
  markInvoicePaid
} from '../services/invoices.js';

export function registerInvoiceRoutes(app: FastifyInstance) {
  app.get('/api/v1/invoices', async (request, reply) => {
    const querySchema = z.object({
      page: z.coerce.number().optional().default(1),
      per_page: z.coerce.number().optional().default(20),
      status: z.string().optional(),
      client_id: z.string().uuid().optional(),
      date_from: z.string().optional(),
      date_to: z.string().optional(),
      due_from: z.string().optional(),
      due_to: z.string().optional(),
      min_amount: z.coerce.number().optional(),
      max_amount: z.coerce.number().optional(),
      search: z.string().optional(),
      sort: z.string().optional()
    });

    const query = querySchema.parse(request.query);
    const pagination = getPagination(query.page, query.per_page);

    const result = await listInvoices(request.auth.organizationId, {
      page: pagination.page,
      perPage: pagination.perPage,
      status: query.status ? query.status.split(',') : undefined,
      client_id: query.client_id,
      date_from: query.date_from,
      date_to: query.date_to,
      due_from: query.due_from,
      due_to: query.due_to,
      min_amount: query.min_amount,
      max_amount: query.max_amount,
      search: query.search,
      sort: query.sort
    });

    reply.send(
      successResponse(request.auth.requestId, result.data, {
        pagination: buildPaginationMeta(result.total, pagination.page, pagination.perPage),
        summary: result.summary
      })
    );
  });

  app.post('/api/v1/invoices', async (request, reply) => {
    const bodySchema = z.object({
      client_id: z.string().uuid(),
      issue_date: z.string(),
      due_date: z.string(),
      currency: z.string().length(3).optional(),
      line_items: z.array(z.object({
        description: z.string().min(1),
        quantity: z.number().optional().default(1),
        unit: z.string().optional(),
        unit_price_cents: z.number(),
        category_id: z.string().uuid().optional(),
        tax_rate: z.number().optional()
      })).min(1),
      discount_type: z.enum(['percentage', 'fixed']).optional(),
      discount_value: z.number().optional(),
      tax_rate: z.number().optional(),
      notes: z.string().max(2000).optional(),
      terms: z.string().max(2000).optional(),
      footer: z.string().max(1000).optional(),
      template_id: z.string().uuid().optional(),
      escrow_enabled: z.boolean().optional(),
      escrow_milestones: z.array(z.object({
        description: z.string(),
        amount_cents: z.number(),
        percentage: z.number().optional()
      })).optional(),
      send_immediately: z.boolean().optional(),
      reference: z.string().optional(),
      to_emails: z.array(z.string().email()).optional()
    });

    const body = bodySchema.parse(request.body);
    const invoice = await createInvoice(request.auth.organizationId, request.auth.userId, body);

    reply.code(201).send(successResponse(request.auth.requestId, invoice));
  });

  app.get('/api/v1/invoices/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const querySchema = z.object({ include: z.string().optional() });

    const params = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);

    const include = new Set((query.include ?? '').split(',').map((value) => value.trim()).filter(Boolean));
    const invoice = await getInvoice(request.auth.organizationId, params.id, {
      includeLineItems: include.has('line_items'),
      includeActivities: include.has('activities'),
      includeAttachments: include.has('attachments'),
      includePayments: include.has('payments'),
      includeEscrow: include.has('escrow')
    });

    reply.send(successResponse(request.auth.requestId, invoice));
  });

  app.put('/api/v1/invoices/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      issue_date: z.string().optional(),
      due_date: z.string().optional(),
      currency: z.string().length(3).optional(),
      line_items: z.array(z.object({
        description: z.string().min(1),
        quantity: z.number().optional().default(1),
        unit: z.string().optional(),
        unit_price_cents: z.number(),
        category_id: z.string().uuid().optional(),
        tax_rate: z.number().optional()
      })).optional(),
      discount_type: z.enum(['percentage', 'fixed']).optional(),
      discount_value: z.number().optional(),
      tax_rate: z.number().optional(),
      notes: z.string().max(2000).optional(),
      terms: z.string().max(2000).optional(),
      footer: z.string().max(1000).optional(),
      template_id: z.string().uuid().optional(),
      escrow_enabled: z.boolean().optional(),
      reference: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const updated = await updateInvoice(request.auth.organizationId, params.id, body);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.delete('/api/v1/invoices/:id', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const result = await deleteInvoice(request.auth.organizationId, params.id);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/invoices/:id/send', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      to_emails: z.array(z.string().email()).optional(),
      cc_emails: z.array(z.string().email()).optional(),
      subject: z.string().optional(),
      message: z.string().optional(),
      attach_pdf: z.boolean().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const updated = await sendInvoice(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.post('/api/v1/invoices/:id/remind', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      template_id: z.string().uuid().optional(),
      custom_message: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await sendReminder(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.send(successResponse(request.auth.requestId, result));
  });

  app.post('/api/v1/invoices/:id/duplicate', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      issue_date: z.string().optional(),
      due_date: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await duplicateInvoice(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.code(201).send(successResponse(request.auth.requestId, result));
  });

  app.get('/api/v1/invoices/:id/pdf', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const params = paramsSchema.parse(request.params);

    const file = await generatePdf(request.auth.organizationId, params.id);

    reply.header('Content-Type', 'application/pdf');
    reply.header('Content-Disposition', `attachment; filename="${params.id}.pdf"`);
    reply.send(await import('node:fs/promises').then((fs) => fs.readFile(file.filePath)));
  });

  app.post('/api/v1/invoices/:id/cancel', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      reason: z.string().optional(),
      notify_client: z.boolean().optional().default(true)
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const updated = await cancelInvoice(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.send(successResponse(request.auth.requestId, updated));
  });

  app.post('/api/v1/invoices/:id/mark-paid', async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().uuid() });
    const bodySchema = z.object({
      amount_cents: z.number().positive(),
      payment_method: z.string(),
      paid_at: z.string().optional(),
      reference: z.string().optional(),
      notes: z.string().optional()
    });

    const params = paramsSchema.parse(request.params);
    const body = bodySchema.parse(request.body);

    const result = await markInvoicePaid(request.auth.organizationId, request.auth.userId, params.id, body);
    reply.send(successResponse(request.auth.requestId, result));
  });
}
