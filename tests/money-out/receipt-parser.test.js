import { describe, expect, it } from 'vitest';
import { ReceiptParser } from '../../src/money-out/utils/receipt-parser.js';
describe('ReceiptParser', () => {
    it('extracts vendor, total, and date', () => {
        const parser = new ReceiptParser();
        const text = [
            'ACME INC',
            '123 Main St',
            'Date: 01/15/2026',
            'Total: $45.99'
        ].join('\n');
        const result = parser.parseReceiptText(text);
        expect(result.vendor_name).toBe('ACME INC');
        expect(result.total_amount).toBe(45.99);
        expect(result.transaction_date).toBe('2026-01-15');
    });
});
