import { describe, expect, it } from 'vitest';
import { getMileageRateCents, calculateMileageDeduction } from '../../src/money-out/utils/mileage.js';

describe('mileage utils', () => {
  it('calculates rate for business mileage', () => {
    const rate = getMileageRateCents('2026-01-15', 'business');
    expect(rate).toBe(72);
  });

  it('calculates deduction in cents', () => {
    const deduction = calculateMileageDeduction(10, 72);
    expect(deduction).toBe(720);
  });
});
