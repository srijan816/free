import { format } from 'date-fns';
import { US_TAX_RATES_2026, TaxFilingStatus } from '../../common/constants/tax-rates.js';
import { query } from '../../database/db.js';
import { TaxSettingsRepository } from './repositories/tax-settings.repository.js';
import { TaxEstimatesRepository } from './repositories/tax-estimates.repository.js';

export interface TaxEstimate {
  organization_id: string;
  tax_year: number;
  calculated_at: string;
  gross_income_cents: number;
  total_deductions_cents: number;
  net_profit_cents: number;
  se_tax_base_cents: number;
  se_tax_cents: number;
  se_tax_deduction_cents: number;
  qbi_deduction_cents: number;
  adjusted_gross_income_cents: number;
  standard_or_itemized_deduction_cents: number;
  taxable_income_cents: number;
  federal_income_tax_cents: number;
  effective_tax_rate: number;
  marginal_tax_rate: number;
  total_tax_cents: number;
  quarterly_payment_cents: number;
  payments_made_cents: number;
  remaining_liability_cents: number;
  quarterly_breakdown: Array<{
    quarter: 1 | 2 | 3 | 4;
    due_date: string;
    estimated_payment_cents: number;
    paid_cents: number;
    status: 'upcoming' | 'due' | 'paid' | 'overdue';
  }>;
  deduction_summary: {
    business_expenses_cents: number;
    home_office_cents: number;
    se_tax_deduction_cents: number;
    retirement_cents: number;
    health_insurance_cents: number;
    qbi_deduction_cents: number;
    total_cents: number;
  };
  tax_savings: {
    from_business_expenses_cents: number;
    from_home_office_cents: number;
    from_retirement_cents: number;
    from_qbi_cents: number;
    total_savings_cents: number;
  };
}

export class TaxCalculationService {
  private readonly taxSettingsRepo: TaxSettingsRepository;
  private readonly taxEstimatesRepo: TaxEstimatesRepository;

  constructor() {
    this.taxSettingsRepo = new TaxSettingsRepository();
    this.taxEstimatesRepo = new TaxEstimatesRepository();
  }

  async calculateTaxEstimate(
    organizationId: string,
    taxYear: number = new Date().getFullYear()
  ): Promise<TaxEstimate> {
    const settings = await this.taxSettingsRepo.find(organizationId, taxYear);
    const filingStatus = (settings?.filing_status as TaxFilingStatus) || 'single';

    const yearStart = `${taxYear}-01-01`;
    const yearEnd = taxYear === new Date().getFullYear()
      ? format(new Date(), 'yyyy-MM-dd')
      : `${taxYear}-12-31`;

    const grossIncome = await this.getGrossIncome(organizationId, yearStart, yearEnd);
    const businessExpenses = await this.getBusinessExpenses(organizationId, yearStart, yearEnd);

    const homeOffice = settings?.home_office_enabled
      ? this.calculateHomeOfficeDeduction(settings)
      : 0;

    const netProfit = grossIncome - businessExpenses - homeOffice;
    const seTaxBase = Math.round(Math.max(0, netProfit) * 0.9235);
    const seTax = Math.round(seTaxBase * US_TAX_RATES_2026.self_employment_tax_rate);
    const seTaxDeduction = Math.round(seTax * US_TAX_RATES_2026.self_employment_deduction);

    const retirement = (settings?.sep_ira_contribution_cents || 0) + (settings?.solo_401k_contribution_cents || 0);
    const healthInsurance = settings?.self_employed_health_insurance_cents || 0;

    let agi = netProfit
      - seTaxDeduction
      - retirement
      - healthInsurance
      + (settings?.other_income_cents || 0)
      + (settings?.spouse_income_cents || 0);

    const standardDeduction = filingStatus === 'married_filing_jointly'
      ? US_TAX_RATES_2026.standard_deduction_married
      : US_TAX_RATES_2026.standard_deduction_single;

    const deduction = settings?.use_standard_deduction === false
      ? Math.max(settings?.itemized_deductions_cents || 0, standardDeduction)
      : standardDeduction;

    const qbiDeduction = this.calculateQBIDeduction(netProfit, settings, US_TAX_RATES_2026);
    const taxableIncome = Math.max(0, agi - deduction - qbiDeduction);

    const { tax: federalTax, effectiveRate, marginalRate } = this.calculateFederalTax(
      taxableIncome,
      filingStatus,
      US_TAX_RATES_2026
    );

    const totalTax = seTax + federalTax;
    const quarterlyPayment = Math.round(totalTax / 4);

    const paymentsMade = this.sumQuarterlyPayments(settings);
    const quarterlyBreakdown = this.buildQuarterlyBreakdown(
      taxYear,
      quarterlyPayment,
      settings
    );

    const taxSavings = this.calculateTaxSavings(
      businessExpenses,
      homeOffice,
      retirement,
      qbiDeduction,
      marginalRate
    );

    const estimate: TaxEstimate = {
      organization_id: organizationId,
      tax_year: taxYear,
      calculated_at: new Date().toISOString(),
      gross_income_cents: grossIncome,
      total_deductions_cents: businessExpenses + homeOffice,
      net_profit_cents: netProfit,
      se_tax_base_cents: seTaxBase,
      se_tax_cents: seTax,
      se_tax_deduction_cents: seTaxDeduction,
      qbi_deduction_cents: qbiDeduction,
      adjusted_gross_income_cents: agi,
      standard_or_itemized_deduction_cents: deduction,
      taxable_income_cents: taxableIncome,
      federal_income_tax_cents: federalTax,
      effective_tax_rate: effectiveRate,
      marginal_tax_rate: marginalRate,
      total_tax_cents: totalTax,
      quarterly_payment_cents: quarterlyPayment,
      payments_made_cents: paymentsMade,
      remaining_liability_cents: Math.max(0, totalTax - paymentsMade),
      quarterly_breakdown: quarterlyBreakdown,
      deduction_summary: {
        business_expenses_cents: businessExpenses,
        home_office_cents: homeOffice,
        se_tax_deduction_cents: seTaxDeduction,
        retirement_cents: retirement,
        health_insurance_cents: healthInsurance,
        qbi_deduction_cents: qbiDeduction,
        total_cents: businessExpenses + homeOffice + seTaxDeduction + retirement + healthInsurance + qbiDeduction
      },
      tax_savings: taxSavings
    };

    await this.taxEstimatesRepo.upsert({
      organization_id: organizationId,
      tax_year: taxYear,
      as_of_date: yearEnd,
      gross_income_cents: grossIncome,
      total_deductions_cents: businessExpenses + homeOffice,
      net_profit_cents: netProfit,
      se_tax_base_cents: seTaxBase,
      self_employment_tax_cents: seTax,
      se_tax_deduction_cents: seTaxDeduction,
      adjusted_gross_income_cents: agi,
      standard_deduction_cents: standardDeduction,
      itemized_deduction_cents: settings?.itemized_deductions_cents || 0,
      deduction_used_cents: deduction,
      qbi_deduction_cents: qbiDeduction,
      taxable_income_cents: taxableIncome,
      federal_income_tax_cents: federalTax,
      state_income_tax_cents: 0,
      total_tax_liability_cents: totalTax,
      total_quarterly_payments_cents: paymentsMade,
      remaining_tax_owed_cents: Math.max(0, totalTax - paymentsMade),
      next_quarterly_due_date: quarterlyBreakdown[0]?.due_date || null,
      next_quarterly_amount_cents: quarterlyPayment,
      effective_tax_rate_percent: effectiveRate * 100,
      marginal_tax_bracket_percent: marginalRate * 100,
      recommended_monthly_savings_cents: Math.round(totalTax / 12),
      recommended_tax_reserve_percent: totalTax > 0 && grossIncome > 0 ? (totalTax / grossIncome) * 100 : 0,
      confidence_level: 'estimated'
    });

    return estimate;
  }

  private async getGrossIncome(organizationId: string, start: string, end: string) {
    const result = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = 'income'
         AND date >= $2 AND date <= $3`,
      [organizationId, start, end]
    );

    return Number(result.rows[0]?.total || 0);
  }

  private async getBusinessExpenses(organizationId: string, start: string, end: string) {
    const result = await query<{ total: string }>(
      `SELECT COALESCE(SUM(le.amount_cents), 0) as total
       FROM ledger_entries le
       JOIN categories c ON le.category_id = c.id
       WHERE le.organization_id = $1
         AND le.type = 'expense'
         AND le.date >= $2 AND le.date <= $3
         AND c.is_tax_deductible = TRUE`,
      [organizationId, start, end]
    );

    return Number(result.rows[0]?.total || 0);
  }

  private calculateHomeOfficeDeduction(settings: any): number {
    if (!settings?.home_office_square_feet) return 0;
    const squareFeet = Math.min(settings.home_office_square_feet, 300);
    if (settings.home_office_method === 'simplified') {
      return squareFeet * 500; // $5 per square foot in cents
    }

    const ratio = settings.home_total_square_feet
      ? squareFeet / settings.home_total_square_feet
      : 0;
    const estimatedHomeExpenses = 200000; // placeholder
    return Math.round(estimatedHomeExpenses * ratio);
  }

  private calculateFederalTax(
    taxableIncomeCents: number,
    filingStatus: TaxFilingStatus,
    taxRates: typeof US_TAX_RATES_2026
  ): { tax: number; effectiveRate: number; marginalRate: number } {
    const brackets = filingStatus === 'married_filing_jointly'
      ? taxRates.federal_brackets_single.map((bracket) => ({
          ...bracket,
          max: bracket.max === Infinity ? Infinity : bracket.max * 2,
          min: bracket.min * 2
        }))
      : taxRates.federal_brackets_single;

    let tax = 0;
    let marginalRate = 0;
    let remainingIncome = taxableIncomeCents / 100;

    for (const bracket of brackets) {
      if (remainingIncome <= 0) break;
      const bracketSize = bracket.max - bracket.min;
      const taxableInBracket = Math.min(remainingIncome, bracketSize);
      tax += taxableInBracket * bracket.rate;
      marginalRate = bracket.rate;
      remainingIncome -= taxableInBracket;
    }

    const taxCents = Math.round(tax * 100);
    const effectiveRate = taxableIncomeCents > 0 ? taxCents / taxableIncomeCents : 0;

    return {
      tax: taxCents,
      effectiveRate,
      marginalRate
    };
  }

  private calculateQBIDeduction(netProfit: number, settings: any, taxRates: typeof US_TAX_RATES_2026): number {
    if (netProfit <= 0) return 0;
    const totalIncome = netProfit + (settings?.other_income_cents || 0) + (settings?.spouse_income_cents || 0);
    const limit = settings?.filing_status === 'married_filing_jointly'
      ? taxRates.qbi_income_limit_single * 2
      : taxRates.qbi_income_limit_single;

    if (totalIncome > limit) return 0;

    return Math.round(netProfit * taxRates.qbi_deduction_rate);
  }

  private sumQuarterlyPayments(settings: any): number {
    return (
      (settings?.q1_payment_cents || 0) +
      (settings?.q2_payment_cents || 0) +
      (settings?.q3_payment_cents || 0) +
      (settings?.q4_payment_cents || 0)
    );
  }

  private buildQuarterlyBreakdown(
    taxYear: number,
    quarterlyPayment: number,
    settings: any
  ) {
    const today = new Date();
    return US_TAX_RATES_2026.quarterly_due_dates.map((q) => {
      const dueYear = q.quarter === 4 ? taxYear + 1 : taxYear;
      const dueDate = `${dueYear}-${q.due}`;
      const due = new Date(`${dueYear}-${q.due}`);
      let status: 'upcoming' | 'due' | 'paid' | 'overdue' = 'upcoming';
      const paid = settings?.[`q${q.quarter}_payment_cents`] || 0;
      const paymentDate = settings?.[`q${q.quarter}_payment_date`];

      if (paymentDate) {
        status = 'paid';
      } else if (today > due) {
        status = 'overdue';
      } else if (today.toDateString() === due.toDateString()) {
        status = 'due';
      }

      return {
        quarter: q.quarter as 1 | 2 | 3 | 4,
        due_date: dueDate,
        estimated_payment_cents: quarterlyPayment,
        paid_cents: paid,
        status
      };
    });
  }

  private calculateTaxSavings(
    businessExpenses: number,
    homeOffice: number,
    retirement: number,
    qbiDeduction: number,
    marginalRate: number
  ) {
    const fromBusiness = Math.round(businessExpenses * marginalRate);
    const fromHomeOffice = Math.round(homeOffice * marginalRate);
    const fromRetirement = Math.round(retirement * marginalRate);
    const fromQbi = Math.round(qbiDeduction * marginalRate);

    return {
      from_business_expenses_cents: fromBusiness,
      from_home_office_cents: fromHomeOffice,
      from_retirement_cents: fromRetirement,
      from_qbi_cents: fromQbi,
      total_savings_cents: fromBusiness + fromHomeOffice + fromRetirement + fromQbi
    };
  }
}
