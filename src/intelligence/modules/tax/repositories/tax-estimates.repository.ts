import { query } from '../../../database/db.js';

export interface TaxEstimateRecord {
  organization_id: string;
  tax_year: number;
  as_of_date: string;
  gross_income_cents: number;
  total_deductions_cents: number;
  net_profit_cents: number;
  se_tax_base_cents: number;
  self_employment_tax_cents: number;
  se_tax_deduction_cents: number;
  adjusted_gross_income_cents: number;
  standard_deduction_cents: number;
  itemized_deduction_cents: number;
  deduction_used_cents: number;
  qbi_deduction_cents: number;
  taxable_income_cents: number;
  federal_income_tax_cents: number;
  state_income_tax_cents: number;
  total_tax_liability_cents: number;
  total_quarterly_payments_cents: number;
  remaining_tax_owed_cents: number;
  next_quarterly_due_date: string | null;
  next_quarterly_amount_cents: number;
  effective_tax_rate_percent: number;
  marginal_tax_bracket_percent: number;
  recommended_monthly_savings_cents: number;
  recommended_tax_reserve_percent: number;
  confidence_level: string;
}

export class TaxEstimatesRepository {
  async upsert(record: TaxEstimateRecord) {
    await query(
      `INSERT INTO tax_estimates (
        organization_id,
        tax_year,
        as_of_date,
        gross_income_cents,
        total_deductions_cents,
        net_profit_cents,
        se_tax_base_cents,
        self_employment_tax_cents,
        se_tax_deduction_cents,
        adjusted_gross_income_cents,
        standard_deduction_cents,
        itemized_deduction_cents,
        deduction_used_cents,
        qbi_deduction_cents,
        taxable_income_cents,
        federal_income_tax_cents,
        state_income_tax_cents,
        total_tax_liability_cents,
        total_quarterly_payments_cents,
        remaining_tax_owed_cents,
        next_quarterly_due_date,
        next_quarterly_amount_cents,
        effective_tax_rate_percent,
        marginal_tax_bracket_percent,
        recommended_monthly_savings_cents,
        recommended_tax_reserve_percent,
        confidence_level
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27
      )
      ON CONFLICT (organization_id, tax_year, as_of_date)
      DO UPDATE SET
        gross_income_cents = EXCLUDED.gross_income_cents,
        total_deductions_cents = EXCLUDED.total_deductions_cents,
        net_profit_cents = EXCLUDED.net_profit_cents,
        se_tax_base_cents = EXCLUDED.se_tax_base_cents,
        self_employment_tax_cents = EXCLUDED.self_employment_tax_cents,
        se_tax_deduction_cents = EXCLUDED.se_tax_deduction_cents,
        adjusted_gross_income_cents = EXCLUDED.adjusted_gross_income_cents,
        standard_deduction_cents = EXCLUDED.standard_deduction_cents,
        itemized_deduction_cents = EXCLUDED.itemized_deduction_cents,
        deduction_used_cents = EXCLUDED.deduction_used_cents,
        qbi_deduction_cents = EXCLUDED.qbi_deduction_cents,
        taxable_income_cents = EXCLUDED.taxable_income_cents,
        federal_income_tax_cents = EXCLUDED.federal_income_tax_cents,
        state_income_tax_cents = EXCLUDED.state_income_tax_cents,
        total_tax_liability_cents = EXCLUDED.total_tax_liability_cents,
        total_quarterly_payments_cents = EXCLUDED.total_quarterly_payments_cents,
        remaining_tax_owed_cents = EXCLUDED.remaining_tax_owed_cents,
        next_quarterly_due_date = EXCLUDED.next_quarterly_due_date,
        next_quarterly_amount_cents = EXCLUDED.next_quarterly_amount_cents,
        effective_tax_rate_percent = EXCLUDED.effective_tax_rate_percent,
        marginal_tax_bracket_percent = EXCLUDED.marginal_tax_bracket_percent,
        recommended_monthly_savings_cents = EXCLUDED.recommended_monthly_savings_cents,
        recommended_tax_reserve_percent = EXCLUDED.recommended_tax_reserve_percent,
        confidence_level = EXCLUDED.confidence_level,
        computed_at = NOW()`,
      [
        record.organization_id,
        record.tax_year,
        record.as_of_date,
        record.gross_income_cents,
        record.total_deductions_cents,
        record.net_profit_cents,
        record.se_tax_base_cents,
        record.self_employment_tax_cents,
        record.se_tax_deduction_cents,
        record.adjusted_gross_income_cents,
        record.standard_deduction_cents,
        record.itemized_deduction_cents,
        record.deduction_used_cents,
        record.qbi_deduction_cents,
        record.taxable_income_cents,
        record.federal_income_tax_cents,
        record.state_income_tax_cents,
        record.total_tax_liability_cents,
        record.total_quarterly_payments_cents,
        record.remaining_tax_owed_cents,
        record.next_quarterly_due_date,
        record.next_quarterly_amount_cents,
        record.effective_tax_rate_percent,
        record.marginal_tax_bracket_percent,
        record.recommended_monthly_savings_cents,
        record.recommended_tax_reserve_percent,
        record.confidence_level
      ]
    );
  }
}
