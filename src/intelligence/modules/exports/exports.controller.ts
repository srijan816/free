import { Router, Request, Response, NextFunction } from 'express';
import { ExportsService } from './exports.service.js';

export const createExportsRouter = (service: ExportsService): Router => {
  const router = Router();

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const exportJob = await service.createExport(organizationId, req.body);
      res.status(202).json({ success: true, data: exportJob });
    } catch (error) {
      next(error);
    }
  });

  router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const exportJob = await service.getExport(organizationId, req.params.id);
      if (!exportJob) {
        res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Export not found' } });
        return;
      }
      res.json({ success: true, data: exportJob });
    } catch (error) {
      next(error);
    }
  });

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const limit = Number(req.query.limit || 20);
      const offset = Number(req.query.offset || 0);
      const result = await service.listExports(organizationId, limit, offset);
      res.json({
        success: true,
        data: {
          exports: result.items,
          pagination: {
            limit,
            offset,
            total: result.total,
            has_more: offset + limit < result.total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
