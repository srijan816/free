export function centsToDecimal(cents: number): number {
  return cents / 100;
}

export function decimalToCents(decimal: number): number {
  return Math.round(decimal * 100);
}

export function formatMoney(cents: number, currency: string): string {
  const decimal = centsToDecimal(cents);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(decimal);
}
