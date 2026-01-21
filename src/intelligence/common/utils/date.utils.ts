import {
  addDays,
  differenceInDays,
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  parseISO,
  startOfMonth,
  startOfQuarter,
  startOfYear,
  subMonths,
  subQuarters,
  subYears
} from 'date-fns';

type PeriodKey =
  | 'today'
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'this_quarter'
  | 'last_quarter'
  | 'this_year'
  | 'last_year'
  | 'year_to_date'
  | 'custom';

export interface PeriodRange {
  start: Date;
  end: Date;
  previousStart: Date;
  previousEnd: Date;
  label: string;
}

export const toIsoDate = (date: Date): string => format(date, 'yyyy-MM-dd');

const normalizeEnd = (date: Date): Date => date;

export const getPeriodRange = (
  period: PeriodKey,
  customStart?: string,
  customEnd?: string
): PeriodRange => {
  const now = new Date();

  if (period === 'custom') {
    if (!customStart || !customEnd) {
      throw new Error('Custom period requires start and end dates');
    }
    const start = parseISO(customStart);
    const end = parseISO(customEnd);
    const days = Math.max(0, differenceInDays(end, start));
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -days);
    return {
      start,
      end: normalizeEnd(end),
      previousStart,
      previousEnd,
      label: formatPeriodLabel(start, end)
    };
  }

  if (period === 'today') {
    const start = now;
    const end = now;
    const previousStart = addDays(now, -1);
    const previousEnd = previousStart;
    return {
      start,
      end: normalizeEnd(end),
      previousStart,
      previousEnd,
      label: format(now, 'MMM d, yyyy')
    };
  }

  if (period === 'this_week') {
    const start = addDays(now, -6);
    const end = now;
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -6);
    return {
      start,
      end: normalizeEnd(end),
      previousStart,
      previousEnd,
      label: formatPeriodLabel(start, end)
    };
  }

  if (period === 'this_month') {
    const start = startOfMonth(now);
    const end = endOfMonth(now);
    const prev = subMonths(now, 1);
    return {
      start,
      end: normalizeEnd(end),
      previousStart: startOfMonth(prev),
      previousEnd: endOfMonth(prev),
      label: format(start, 'MMMM yyyy')
    };
  }

  if (period === 'last_month') {
    const target = subMonths(now, 1);
    const start = startOfMonth(target);
    const end = endOfMonth(target);
    const prev = subMonths(target, 1);
    return {
      start,
      end: normalizeEnd(end),
      previousStart: startOfMonth(prev),
      previousEnd: endOfMonth(prev),
      label: format(start, 'MMMM yyyy')
    };
  }

  if (period === 'this_quarter') {
    const start = startOfQuarter(now);
    const end = endOfQuarter(now);
    const prev = subQuarters(now, 1);
    return {
      start,
      end: normalizeEnd(end),
      previousStart: startOfQuarter(prev),
      previousEnd: endOfQuarter(prev),
      label: `Q${format(start, 'q')} ${format(start, 'yyyy')}`
    };
  }

  if (period === 'last_quarter') {
    const target = subQuarters(now, 1);
    const start = startOfQuarter(target);
    const end = endOfQuarter(target);
    const prev = subQuarters(target, 1);
    return {
      start,
      end: normalizeEnd(end),
      previousStart: startOfQuarter(prev),
      previousEnd: endOfQuarter(prev),
      label: `Q${format(start, 'q')} ${format(start, 'yyyy')}`
    };
  }

  if (period === 'this_year') {
    const start = startOfYear(now);
    const end = endOfYear(now);
    const prev = subYears(now, 1);
    return {
      start,
      end: normalizeEnd(end),
      previousStart: startOfYear(prev),
      previousEnd: endOfYear(prev),
      label: format(start, 'yyyy')
    };
  }

  if (period === 'last_year') {
    const target = subYears(now, 1);
    const start = startOfYear(target);
    const end = endOfYear(target);
    const prev = subYears(target, 1);
    return {
      start,
      end: normalizeEnd(end),
      previousStart: startOfYear(prev),
      previousEnd: endOfYear(prev),
      label: format(start, 'yyyy')
    };
  }

  if (period === 'year_to_date') {
    const start = startOfYear(now);
    const end = now;
    const previousEnd = subYears(end, 1);
    const previousStart = subYears(start, 1);
    return {
      start,
      end: normalizeEnd(end),
      previousStart,
      previousEnd,
      label: 'Year to Date'
    };
  }

  throw new Error(`Unsupported period: ${period}`);
};

export const formatPeriodLabel = (start: Date, end: Date): string => {
  if (format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd')) {
    return format(start, 'MMM d, yyyy');
  }
  if (format(start, 'yyyy-MM') === format(end, 'yyyy-MM')) {
    return format(start, 'MMMM yyyy');
  }
  return `${format(start, 'MMM d, yyyy')} - ${format(end, 'MMM d, yyyy')}`;
};
