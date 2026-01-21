import { MILEAGE_RATES } from './constants.js';

export function getMileageRateCents(date: string, purpose: string) {
  const year = date.split('-')[0];
  const rates = (MILEAGE_RATES as any)[year] ?? (MILEAGE_RATES as any)['2026'];
  const rate = rates[purpose] ?? rates.business;
  return Math.round(rate * 100);
}

export function calculateMileageDeduction(distanceMiles: number, ratePerMileCents: number) {
  return Math.round(Number(distanceMiles) * Number(ratePerMileCents));
}
