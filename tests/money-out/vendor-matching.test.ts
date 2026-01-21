import { describe, expect, it } from 'vitest';
import { cleanMerchantName, calculateMatchScore } from '../../src/money-out/utils/vendor-matching.js';

describe('vendor matching', () => {
  it('cleans common merchant patterns', () => {
    expect(cleanMerchantName('AMZN MKTP US*1234')).toBe('Amazon');
  });

  it('calculates high score for close matches', () => {
    const score = calculateMatchScore('AMZN MKTP US*1234', {
      name: 'Amazon',
      display_name: 'Amazon',
      bank_merchant_names: ['AMZN MKTP US']
    });
    expect(score).toBeGreaterThanOrEqual(80);
  });
});
