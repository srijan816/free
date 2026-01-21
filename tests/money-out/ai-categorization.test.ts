import { describe, expect, it } from 'vitest';
import { aiCategorizeTransaction } from '../../src/money-out/integrations/ai.js';

describe('aiCategorizeTransaction', () => {
  it('matches travel keywords', async () => {
    const result = await aiCategorizeTransaction({
      description: 'UBER *TRIP',
      merchant: 'Uber',
      categories: [
        { id: '1', name: 'Office Expenses' },
        { id: '2', name: 'Travel' }
      ]
    });

    expect(result.category_id).toBe('2');
    expect(result.confidence).toBeGreaterThanOrEqual(70);
  });
});
