import { Router, Request, Response, NextFunction } from 'express';
import { TaxService } from './tax.service.js';
import { centsToMoney } from '../../common/utils/money.utils.js';

export const createTaxRouter = (service: TaxService): Router => {
  const router = Router();

  router.get('/estimate', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const taxYear = Number(req.query.tax_year || new Date().getFullYear());
      const estimate = await service.calculateTaxEstimate(organizationId, taxYear);

      res.json({
        success: true,
        data: {
          tax_year: estimate.tax_year,
          as_of_date: estimate.calculated_at,
          income: {
            gross_receipts: centsToMoney(estimate.gross_income_cents),
            total_deductions: centsToMoney(estimate.total_deductions_cents),
            net_profit: centsToMoney(estimate.net_profit_cents)
          },
          self_employment_tax: {
            se_tax_base: centsToMoney(estimate.se_tax_base_cents),
            se_tax: centsToMoney(estimate.se_tax_cents),
            se_tax_deduction: centsToMoney(estimate.se_tax_deduction_cents)
          },
          income_tax: {
            adjusted_gross_income: centsToMoney(estimate.adjusted_gross_income_cents),
            standard_deduction: centsToMoney(estimate.standard_or_itemized_deduction_cents),
            qbi_deduction: centsToMoney(estimate.qbi_deduction_cents),
            taxable_income: centsToMoney(estimate.taxable_income_cents),
            federal_tax: centsToMoney(estimate.federal_income_tax_cents),
            effective_rate_percent: estimate.effective_tax_rate * 100,
            marginal_rate_percent: estimate.marginal_tax_rate * 100
          },
          total_tax_liability: centsToMoney(estimate.total_tax_cents),
          quarterly_payments: estimate.quarterly_breakdown,
          remaining_tax_owed: centsToMoney(estimate.remaining_liability_cents),
          recommendations: {
            monthly_tax_reserve: centsToMoney(Math.round(estimate.total_tax_cents / 12)),
            reserve_percent: estimate.total_tax_cents > 0 && estimate.gross_income_cents > 0
              ? (estimate.total_tax_cents / estimate.gross_income_cents) * 100
              : 0,
            next_quarterly_due: estimate.quarterly_breakdown[0]?.due_date || '',
            next_quarterly_amount: centsToMoney(estimate.quarterly_payment_cents)
          },
          confidence_level: 'estimated',
          computed_at: estimate.calculated_at
        }
      });
    } catch (error) {
      next(error);
    }
  });

  router.get('/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const taxYear = Number(req.query.tax_year || new Date().getFullYear());
      const settings = await service.getSettings(organizationId, taxYear);
      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  });

  router.put('/settings', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const taxYear = Number(req.body.tax_year || new Date().getFullYear());
      const settings = await service.updateSettings(organizationId, taxYear, req.body);
      res.json({ success: true, data: settings });
    } catch (error) {
      next(error);
    }
  });

  router.post('/quarterly-payment', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const { tax_year, quarter, amount_cents, payment_date } = req.body;
      await service.recordQuarterlyPayment(organizationId, tax_year, quarter, amount_cents, payment_date);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  router.get('/schedule-c', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const taxYear = Number(req.query.tax_year || new Date().getFullYear());
      const scheduleC = await service.generateScheduleC(organizationId, taxYear);
      res.json({ success: true, data: scheduleC });
    } catch (error) {
      next(error);
    }
  });

  router.get('/contractors', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const organizationId = req.context?.organizationId;
      if (!organizationId) {
        res.status(400).json({ success: false, error: { code: 'MISSING_ORGANIZATION', message: 'Missing organization' } });
        return;
      }
      const taxYear = Number(req.query.tax_year || new Date().getFullYear());
      const contractors = await service.getContractorPayments(organizationId, taxYear);
      res.json({
        success: true,
        data: {
          tax_year: taxYear,
          threshold_cents: 60000,
          contractors
        }
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
};
