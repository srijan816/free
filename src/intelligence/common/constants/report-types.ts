export const REPORT_TYPES = {
  PROFIT_AND_LOSS: 'profit_and_loss',
  CASH_FLOW: 'cash_flow',
  BALANCE_SHEET: 'balance_sheet',
  TAX_SUMMARY: 'tax_summary',
  EXPENSE_BY_CATEGORY: 'expense_by_category',
  INCOME_BY_CLIENT: 'income_by_client',
  QUARTERLY_SUMMARY: 'quarterly_summary',
  ANNUAL_SUMMARY: 'annual_summary',
  SCHEDULE_C: 'schedule_c',
  CONTRACTOR_PAYMENTS: 'contractor_payments',
  CUSTOM: 'custom'
} as const;

export type ReportType = typeof REPORT_TYPES[keyof typeof REPORT_TYPES];
