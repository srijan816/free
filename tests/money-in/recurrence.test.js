import { describe, expect, it } from 'vitest';
import { calculateNextIssueDate } from '../../src/money-in/utils/recurrence.js';
describe('calculateNextIssueDate', () => {
    it('calculates weekly dates', () => {
        const schedule = {
            frequency: 'weekly',
            frequency_interval: 1,
            next_issue_date: '2026-01-01',
            status: 'active'
        };
        const next = calculateNextIssueDate(schedule, new Date('2026-01-01'));
        expect(next?.toISOString().split('T')[0]).toBe('2026-01-08');
    });
    it('handles custom day intervals', () => {
        const schedule = {
            frequency: 'custom',
            frequency_interval: 1,
            custom_days: 10,
            next_issue_date: '2026-01-01',
            status: 'active'
        };
        const next = calculateNextIssueDate(schedule, new Date('2026-01-01'));
        expect(next?.toISOString().split('T')[0]).toBe('2026-01-11');
    });
    it('returns null when inactive', () => {
        const schedule = {
            frequency: 'monthly',
            frequency_interval: 1,
            next_issue_date: '2026-01-01',
            status: 'paused'
        };
        expect(calculateNextIssueDate(schedule, new Date('2026-01-01'))).toBeNull();
    });
});
