export const REPORT_PERIODS = {
  THIS_MONTH: 'this_month',
  LAST_MONTH: 'last_month',
  THIS_QUARTER: 'this_quarter',
  LAST_QUARTER: 'last_quarter',
  THIS_YEAR: 'this_year',
  LAST_YEAR: 'last_year',
  YEAR_TO_DATE: 'year_to_date',
  CUSTOM: 'custom'
} as const;

export type ReportPeriod = typeof REPORT_PERIODS[keyof typeof REPORT_PERIODS];
