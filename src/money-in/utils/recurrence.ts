export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly' | 'custom';

export interface RecurringScheduleLike {
  frequency: RecurrenceFrequency;
  frequency_interval: number;
  custom_days?: number | null;
  next_issue_date: string;
  end_date?: string | null;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function addYears(date: Date, years: number) {
  const next = new Date(date);
  next.setUTCFullYear(next.getUTCFullYear() + years);
  return next;
}

export function calculateNextIssueDate(schedule: RecurringScheduleLike, fromDate: Date = new Date()): Date | null {
  if (schedule.status !== 'active') return null;
  if (schedule.end_date && fromDate > new Date(schedule.end_date)) return null;

  const current = new Date(schedule.next_issue_date);

  switch (schedule.frequency) {
    case 'weekly':
      return addDays(current, 7 * schedule.frequency_interval);
    case 'biweekly':
      return addDays(current, 14 * schedule.frequency_interval);
    case 'monthly':
      return addMonths(current, schedule.frequency_interval);
    case 'quarterly':
      return addMonths(current, 3 * schedule.frequency_interval);
    case 'yearly':
      return addYears(current, schedule.frequency_interval);
    case 'custom':
      return addDays(current, schedule.custom_days ?? schedule.frequency_interval);
    default:
      return null;
  }
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().split('T')[0];
}
