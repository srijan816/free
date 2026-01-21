import { describe, expect, it } from 'vitest';
import { calculateNextOccurrenceDate } from '../../src/money-out/utils/recurrence.js';
describe('calculateNextOccurrenceDate', () => {
    it('calculates monthly dates', () => {
        const schedule = {
            frequency: 'monthly',
            frequency_interval: 1,
            next_occurrence_date: '2026-01-01',
            status: 'active'
        };
        const next = calculateNextOccurrenceDate(schedule, new Date('2026-01-01'));
        expect(next?.toISOString().split('T')[0]).toBe('2026-02-01');
    });
    it('handles custom day intervals', () => {
        const schedule = {
            frequency: 'custom',
            frequency_interval: 1,
            custom_days: 10,
            next_occurrence_date: '2026-01-01',
            status: 'active'
        };
        const next = calculateNextOccurrenceDate(schedule, new Date('2026-01-01'));
        expect(next?.toISOString().split('T')[0]).toBe('2026-01-11');
    });
});
