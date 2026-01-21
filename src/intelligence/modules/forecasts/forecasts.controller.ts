import { Router, Request, Response, NextFunction } from 'express';
import { CashFlowForecastService } from './cash-flow-forecast.service.js';

export const createForecastsRouter = (service: CashFlowForecastService): Router => {
  const router = Router();

  router.get('/cash-flow', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const horizon = Number(req.query.horizon_days || 30);
      const forecast = await service.generateForecast(organizationId, horizon);
      res.json({ success: true, data: forecast });
    } catch (error) {
      next(error);
    }
  });

  router.get('/revenue', async (_req: Request, res: Response) => {
    res.json({ success: true, data: { forecasts: [], summary: {}, methodology: 'weighted_average', confidence_score: 0.5 } });
  });

  return router;
};
