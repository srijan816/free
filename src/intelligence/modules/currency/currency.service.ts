import { query } from '../../database/db.js';

export class CurrencyService {
  async getHistoricalRate(
    fromCurrency: string,
    toCurrency: string,
    date: string
  ): Promise<number> {
    if (fromCurrency === toCurrency) return 1;

    const direct = await query<{ rate: string }>(
      `SELECT rate FROM exchange_rates
       WHERE base_currency = $1
         AND target_currency = $2
         AND rate_date <= $3
       ORDER BY rate_date DESC
       LIMIT 1`,
      [fromCurrency, toCurrency, date]
    );

    if (direct.rows[0]?.rate) {
      return Number(direct.rows[0].rate);
    }

    const inverse = await query<{ rate: string }>(
      `SELECT rate FROM exchange_rates
       WHERE base_currency = $1
         AND target_currency = $2
         AND rate_date <= $3
       ORDER BY rate_date DESC
       LIMIT 1`,
      [toCurrency, fromCurrency, date]
    );

    if (inverse.rows[0]?.rate) {
      const rate = Number(inverse.rows[0].rate);
      return rate === 0 ? 1 : 1 / rate;
    }

    return 1;
  }

  async convertToBaseCurrency(
    amountCents: number,
    fromCurrency: string,
    toCurrency: string,
    date: string
  ): Promise<number> {
    const rate = await this.getHistoricalRate(fromCurrency, toCurrency, date);
    return Math.round(amountCents * rate);
  }
}
