export const TAX_FILING_STATUS = {
  SINGLE: 'single',
  MARRIED_FILING_JOINTLY: 'married_filing_jointly',
  MARRIED_FILING_SEPARATELY: 'married_filing_separately',
  HEAD_OF_HOUSEHOLD: 'head_of_household',
  QUALIFYING_WIDOW: 'qualifying_widow'
} as const;

export type TaxFilingStatus = typeof TAX_FILING_STATUS[keyof typeof TAX_FILING_STATUS];

export const US_TAX_RATES_2026 = {
  self_employment_tax_rate: 0.153,
  self_employment_deduction: 0.5,
  federal_brackets_single: [
    { min: 0, max: 11600, rate: 0.10 },
    { min: 11600, max: 47150, rate: 0.12 },
    { min: 47150, max: 100525, rate: 0.22 },
    { min: 100525, max: 191950, rate: 0.24 },
    { min: 191950, max: 243725, rate: 0.32 },
    { min: 243725, max: 609350, rate: 0.35 },
    { min: 609350, max: Infinity, rate: 0.37 }
  ],
  standard_deduction_single: 14600,
  standard_deduction_married: 29200,
  qbi_deduction_rate: 0.20,
  qbi_income_limit_single: 182100,
  quarterly_due_dates: [
    { quarter: 1, due: '04-15' },
    { quarter: 2, due: '06-15' },
    { quarter: 3, due: '09-15' },
    { quarter: 4, due: '01-15' }
  ],
  contractor_1099_threshold: 600
} as const;
