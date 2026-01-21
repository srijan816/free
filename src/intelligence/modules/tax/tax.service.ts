import { query } from '../../database/db.js';
import { TaxCalculationService } from './tax-calculation.service.js';
import { TaxSettingsRepository } from './repositories/tax-settings.repository.js';
import { ScheduleCService } from './schedule-c.service.js';

export class TaxService {
  private readonly taxCalculator: TaxCalculationService;
  private readonly taxSettingsRepo: TaxSettingsRepository;
  private readonly scheduleCService: ScheduleCService;

  constructor() {
    this.taxCalculator = new TaxCalculationService();
    this.taxSettingsRepo = new TaxSettingsRepository();
    this.scheduleCService = new ScheduleCService();
  }

  async calculateTaxEstimate(organizationId: string, taxYear?: number) {
    return this.taxCalculator.calculateTaxEstimate(organizationId, taxYear);
  }

  async getSettings(organizationId: string, taxYear: number) {
    return this.taxSettingsRepo.find(organizationId, taxYear);
  }

  async updateSettings(organizationId: string, taxYear: number, payload: Record<string, unknown>) {
    await this.taxSettingsRepo.upsert(organizationId, taxYear, payload);
    return this.getSettings(organizationId, taxYear);
  }

  async recordQuarterlyPayment(
    organizationId: string,
    taxYear: number,
    quarter: 1 | 2 | 3 | 4,
    amountCents: number,
    paymentDate: string
  ) {
    await this.taxSettingsRepo.recordQuarterlyPayment(organizationId, taxYear, quarter, amountCents, paymentDate);
  }

  async generateScheduleC(organizationId: string, taxYear: number) {
    return this.scheduleCService.generateScheduleC(organizationId, taxYear);
  }

  async getContractorPayments(organizationId: string, taxYear: number) {
    const result = await query<{ vendor_id: string; vendor_name: string; tax_id: string | null; total_paid: string; payments: any }>(
      `SELECT
        v.id as vendor_id,
        v.name as vendor_name,
        v.tax_id as tax_id,
        SUM(e.amount_cents) as total_paid,
        json_agg(json_build_object(
          'expense_id', e.id,
          'date', e.date,
          'amount_cents', e.amount_cents,
          'description', e.description
        ) ORDER BY e.date) as payments
       FROM vendors v
       JOIN expenses e ON v.id = e.vendor_id
       WHERE v.organization_id = $1
         AND v.is_1099_vendor = TRUE
         AND EXTRACT(YEAR FROM e.date) = $2
       GROUP BY v.id, v.name, v.tax_id
       HAVING SUM(e.amount_cents) >= 60000
       ORDER BY total_paid DESC`,
      [organizationId, taxYear]
    );

    return result.rows.map((row) => ({
      id: `contractor-${row.vendor_id}-${taxYear}`,
      organization_id: organizationId,
      tax_year: taxYear,
      vendor_id: row.vendor_id,
      vendor_name: row.vendor_name,
      tax_id: row.tax_id,
      total_paid_cents: Number(row.total_paid || 0),
      requires_1099: true,
      w9_received: !!row.tax_id,
      form_1099_generated: false,
      form_1099_sent: false,
      payments: row.payments || [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }));
  }
}
