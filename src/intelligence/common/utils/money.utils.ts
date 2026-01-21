import { MoneyAmount } from '../interfaces/money.interface.js';

export const formatMoney = (cents: number, currency: string = 'USD'): string => {
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency
  }).format(dollars);
};

export const centsToMoney = (cents: number, currency: string = 'USD'): MoneyAmount => {
  return {
    cents,
    currency,
    formatted: formatMoney(cents, currency)
  };
};
