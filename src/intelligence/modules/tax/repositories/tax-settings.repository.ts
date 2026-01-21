import { query } from '../../../database/db.js';

export interface TaxSettingsRecord {
  id: string;
  organization_id: string;
  tax_year: number;
  filing_status: string;
  state_code: string | null;
  other_income_cents: number;
  spouse_income_cents: number;
  use_standard_deduction: boolean;
  itemized_deductions_cents: number;
  home_office_enabled: boolean;
  home_office_square_feet: number | null;
  home_total_square_feet: number | null;
  home_office_method: string;
  self_employed_health_insurance_cents: number;
  sep_ira_contribution_cents: number;
  solo_401k_contribution_cents: number;
  q1_payment_cents: number;
  q1_payment_date: string | null;
  q2_payment_cents: number;
  q2_payment_date: string | null;
  q3_payment_cents: number;
  q3_payment_date: string | null;
  q4_payment_cents: number;
  q4_payment_date: string | null;
}

export class TaxSettingsRepository {
  async find(organizationId: string, taxYear: number): Promise<TaxSettingsRecord | null> {
    const result = await query<TaxSettingsRecord>(
      `SELECT * FROM tax_settings WHERE organization_id = $1 AND tax_year = $2`,
      [organizationId, taxYear]
    );

    return result.rows[0] || null;
  }

  async upsert(organizationId: string, taxYear: number, payload: Partial<TaxSettingsRecord>) {
    await query(
      `INSERT INTO tax_settings (
        organization_id,
        tax_year,
        filing_status,
        state_code,
        other_income_cents,
        spouse_income_cents,
        use_standard_deduction,
        itemized_deductions_cents,
        home_office_enabled,
        home_office_square_feet,
        home_total_square_feet,
        home_office_method,
        self_employed_health_insurance_cents,
        sep_ira_contribution_cents,
        solo_401k_contribution_cents
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
      )
      ON CONFLICT (organization_id, tax_year)
      DO UPDATE SET
        filing_status = EXCLUDED.filing_status,
        state_code = EXCLUDED.state_code,
        other_income_cents = EXCLUDED.other_income_cents,
        spouse_income_cents = EXCLUDED.spouse_income_cents,
        use_standard_deduction = EXCLUDED.use_standard_deduction,
        itemized_deductions_cents = EXCLUDED.itemized_deductions_cents,
        home_office_enabled = EXCLUDED.home_office_enabled,
        home_office_square_feet = EXCLUDED.home_office_square_feet,
        home_total_square_feet = EXCLUDED.home_total_square_feet,
        home_office_method = EXCLUDED.home_office_method,
        self_employed_health_insurance_cents = EXCLUDED.self_employed_health_insurance_cents,
        sep_ira_contribution_cents = EXCLUDED.sep_ira_contribution_cents,
        solo_401k_contribution_cents = EXCLUDED.solo_401k_contribution_cents,
        updated_at = NOW()`,
      [
        organizationId,
        taxYear,
        payload.filing_status || 'single',
        payload.state_code || null,
        payload.other_income_cents || 0,
        payload.spouse_income_cents || 0,
        payload.use_standard_deduction !== false,
        payload.itemized_deductions_cents || 0,
        payload.home_office_enabled || false,
        payload.home_office_square_feet || null,
        payload.home_total_square_feet || null,
        payload.home_office_method || 'simplified',
        payload.self_employed_health_insurance_cents || 0,
        payload.sep_ira_contribution_cents || 0,
        payload.solo_401k_contribution_cents || 0
      ]
    );
  }

  async recordQuarterlyPayment(
    organizationId: string,
    taxYear: number,
    quarter: 1 | 2 | 3 | 4,
    amountCents: number,
    paymentDate: string
  ) {
    const columnAmount = `q${quarter}_payment_cents`;
    const columnDate = `q${quarter}_payment_date`;
    await query(
      `UPDATE tax_settings
       SET ${columnAmount} = $1, ${columnDate} = $2, updated_at = NOW()
       WHERE organization_id = $3 AND tax_year = $4`,
      [amountCents, paymentDate, organizationId, taxYear]
    );
  }
}
