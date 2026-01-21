import { Router, Request, Response, NextFunction } from 'express';
import { BudgetsService } from './budgets.service.js';

export const createBudgetsRouter = (service: BudgetsService): Router => {
  const router = Router();

  router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const budgets = await service.listBudgets(organizationId);
      res.json({ success: true, data: { budgets } });
    } catch (error) {
      next(error);
    }
  });

  router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const budget = await service.createBudget(organizationId, req.body);
      res.status(201).json({ success: true, data: budget });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
