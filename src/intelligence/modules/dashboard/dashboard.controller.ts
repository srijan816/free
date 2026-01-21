import { Router, Request, Response, NextFunction } from 'express';
import { DashboardService } from './dashboard.service.js';

export const createDashboardRouter = (service: DashboardService): Router => {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }

      const period = req.query.period as string | undefined;
      const startDate = req.query.start_date as string | undefined;
      const endDate = req.query.end_date as string | undefined;

      const data = await service.getDashboard(organizationId, period, startDate, endDate);
      res.json({ success: true, data, meta: { computed_at: new Date().toISOString() } });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
