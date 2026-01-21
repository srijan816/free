import { describe, expect, it } from 'vitest';
import { formatInvoiceNumber, generateInvoiceNumber, maybeResetSequence } from '../../src/money-in/utils/invoice-number.js';

describe('invoice number formatting', () => {
  it('formats with padding', () => {
    const now = new Date(Date.UTC(2026, 0, 17));
    const formatted = formatInvoiceNumber('INV-{YEAR}-{NUMBER:4}', 12, { now });
    expect(formatted).toBe('INV-2026-0012');
  });

  it('applies monthly reset', () => {
    const now = new Date(Date.UTC(2026, 1, 1));
    const settings = maybeResetSequence({
      pattern: 'INV-{NUMBER:3}',
      next_number: 40,
      reset_frequency: 'monthly',
      last_reset_at: '2026-01-01T00:00:00.000Z'
    }, now);

    expect(settings.next_number).toBe(1);
  });

  it('increments next number after generation', () => {
    const result = generateInvoiceNumber({
      pattern: 'INV-{NUMBER}',
      next_number: 9,
      reset_frequency: 'never',
      last_reset_at: null
    }, { now: new Date(Date.UTC(2026, 0, 1)) });

    expect(result.invoiceNumber).toBe('INV-9');
    expect(result.nextNumber).toBe(10);
  });
});
