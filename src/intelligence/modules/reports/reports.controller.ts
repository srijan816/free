import { Router, Request, Response, NextFunction } from 'express';
import { ReportsService } from './reports.service.js';

export const createReportsRouter = (service: ReportsService): Router => {
  const router = Router();

  router.get('/profit-and-loss', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const { start_date, end_date, compare_to } = req.query as Record<string, string>;
      if (!start_date || !end_date) {
        res.status(400).json({ success: false, error: { code: 'INVALID_DATE_RANGE', message: 'start_date and end_date are required' } });
        return;
      }
      const report = await service.generateProfitAndLoss(organizationId, start_date, end_date, {
        compare_to: compare_to as any
      });
      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  });

  router.get('/cash-flow', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const { start_date, end_date } = req.query as Record<string, string>;
      if (!start_date || !end_date) {
        res.status(400).json({ success: false, error: { code: 'INVALID_DATE_RANGE', message: 'start_date and end_date are required' } });
        return;
      }
      const report = await service.generateCashFlow(organizationId, start_date, end_date);
      res.json({ success: true, data: report });
    } catch (error) {
      next(error);
    }
  });

  router.post('/generate', async (_req: Request, res: Response) => {
    res.status(202).json({
      success: true,
      data: {
        report_id: `report_${Date.now()}`,
        status: 'queued',
        estimated_completion_seconds: 5
      }
    });
  });

  return router;
};
