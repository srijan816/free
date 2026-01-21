import { Router, Request, Response, NextFunction } from 'express';
import { InsightsService } from './insights.service.js';

export const createInsightsRouter = (service: InsightsService): Router => {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const limit = Number(req.query.limit || 20);
      const offset = Number(req.query.offset || 0);

      const result = await service.listInsights(organizationId, limit, offset);
      res.json({
        success: true,
        data: {
          total: result.total,
          unread_count: result.unreadCount,
          insights: result.items,
          pagination: {
            limit,
            offset,
            has_more: offset + limit < result.total
          }
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      await service.markRead(organizationId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/:id/dismiss', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      await service.dismiss(organizationId, req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      await service.generateInsights(organizationId);
      res.status(202).json({ success: true, data: { status: 'queued' } });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
