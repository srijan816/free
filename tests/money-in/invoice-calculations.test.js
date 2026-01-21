import { describe, expect, it } from 'vitest';
import { calculateInvoiceTotals } from '../../src/money-in/utils/invoice-calculations.js';
describe('calculateInvoiceTotals', () => {
    it('calculates subtotal, discount, tax, and total', () => {
        const totals = calculateInvoiceTotals({
            line_items: [
                { quantity: 2, unit_price_cents: 5000 },
                { quantity: 1, unit_price_cents: 10000 }
            ],
            discount_type: 'percentage',
            discount_value: 10,
            tax_rate: 8.5,
            amount_paid_cents: 0
        });
        expect(totals.subtotal_cents).toBe(20000);
        expect(totals.discount_cents).toBe(2000);
        expect(totals.tax_cents).toBe(1530);
        expect(totals.total_cents).toBe(19530);
        expect(totals.amount_due_cents).toBe(19530);
    });
    it('caps discount at subtotal', () => {
        const totals = calculateInvoiceTotals({
            line_items: [{ quantity: 1, unit_price_cents: 1000 }],
            discount_type: 'fixed',
            discount_value: 5000
        });
        expect(totals.discount_cents).toBe(1000);
        expect(totals.total_cents).toBe(0);
    });
});
