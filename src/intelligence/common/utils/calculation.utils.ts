export const calculateChangePercentage = (current: number, previous: number): number => {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }
  return ((current - previous) / previous) * 100;
};

export const determineTrend = (
  current: number,
  previous: number
): 'up' | 'down' | 'stable' => {
  if (current === previous) return 'stable';
  return current > previous ? 'up' : 'down';
};

export const sumCents = (values: Array<number | null | undefined>): number => {
  return values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
};
