import { addDays, differenceInDays, subYears } from 'date-fns';
import { query } from '../../database/db.js';
import { calculateChangePercentage } from '../../common/utils/calculation.utils.js';
import { formatPeriodLabel, toIsoDate } from '../../common/utils/date.utils.js';

export class ReportsService {
  async generateProfitAndLoss(
    organizationId: string,
    startDate: string,
    endDate: string,
    options: { compare_to?: 'previous_period' | 'same_period_last_year' } = {}
  ) {
    const org = await this.getOrganization(organizationId);
    const comparison = options.compare_to
      ? this.getComparisonPeriod(startDate, endDate, options.compare_to)
      : null;

    const incomeData = await this.fetchIncomeData(organizationId, startDate, endDate, comparison);
    const expenseData = await this.fetchExpenseData(organizationId, startDate, endDate, comparison);

    const grossProfit = {
      amount_cents: incomeData.total_cents,
      comparison_cents: comparison ? incomeData.comparison_cents : undefined,
      change_percentage: comparison
        ? calculateChangePercentage(incomeData.total_cents, incomeData.comparison_cents || 0)
        : undefined,
      margin_percentage: incomeData.total_cents > 0
        ? (incomeData.total_cents / incomeData.total_cents) * 100
        : 0
    };

    const netProfit = {
      amount_cents: incomeData.total_cents - expenseData.total_cents,
      comparison_cents: comparison
        ? (incomeData.comparison_cents || 0) - (expenseData.comparison_cents || 0)
        : undefined,
      change_percentage: comparison
        ? calculateChangePercentage(
            incomeData.total_cents - expenseData.total_cents,
            (incomeData.comparison_cents || 0) - (expenseData.comparison_cents || 0)
          )
        : undefined,
      margin_percentage: incomeData.total_cents > 0
        ? ((incomeData.total_cents - expenseData.total_cents) / incomeData.total_cents) * 100
        : 0
    };

    const summary = {
      total_income_cents: incomeData.total_cents,
      total_expenses_cents: expenseData.total_cents,
      net_profit_cents: netProfit.amount_cents,
      profit_margin_percentage: netProfit.margin_percentage,
      expense_ratio: incomeData.total_cents > 0 ? expenseData.total_cents / incomeData.total_cents : 0,
      largest_expense_category: expenseData.categories.length > 0
        ? expenseData.categories.reduce((a, b) => (a.amount_cents > b.amount_cents ? a : b)).category_name
        : 'None',
      income_transaction_count: incomeData.categories.reduce((sum, c) => sum + c.transaction_count, 0),
      expense_transaction_count: expenseData.categories.reduce((sum, c) => sum + c.transaction_count, 0)
    };

    return {
      report_type: 'profit_and_loss',
      organization_id: organizationId,
      organization_name: org.name,
      period: {
        start: startDate,
        end: endDate,
        label: formatPeriodLabel(new Date(startDate), new Date(endDate))
      },
      comparison_period: comparison
        ? {
            start: comparison.start,
            end: comparison.end,
            label: formatPeriodLabel(new Date(comparison.start), new Date(comparison.end))
          }
        : undefined,
      currency: org.currency,
      generated_at: new Date().toISOString(),
      income: incomeData,
      gross_profit: grossProfit,
      expenses: expenseData,
      net_profit: netProfit,
      summary
    };
  }

  async generateCashFlow(organizationId: string, startDate: string, endDate: string) {
    const inflows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = 'income'
         AND date >= $2 AND date <= $3`,
      [organizationId, startDate, endDate]
    );

    const outflows = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = 'expense'
         AND date >= $2 AND date <= $3`,
      [organizationId, startDate, endDate]
    );

    const daily = await query<{ date: string; inflows: string; outflows: string }>(
      `SELECT date::date as date,
              SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) as inflows,
              SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) as outflows
       FROM ledger_entries
       WHERE organization_id = $1
         AND date >= $2 AND date <= $3
       GROUP BY date::date
       ORDER BY date::date`,
      [organizationId, startDate, endDate]
    );

    const inflowTotal = Number(inflows.rows[0]?.total || 0);
    const outflowTotal = Number(outflows.rows[0]?.total || 0);
    const net = inflowTotal - outflowTotal;

    let running = 0;
    const dailyBreakdown = daily.rows.map((row) => {
      const inflow = Number(row.inflows || 0);
      const outflow = Number(row.outflows || 0);
      const netChange = inflow - outflow;
      running += netChange;
      return {
        date: row.date,
        inflows_cents: inflow,
        outflows_cents: outflow,
        net_cents: netChange,
        running_balance_cents: running
      };
    });

    return {
      report_type: 'cash_flow',
      period: {
        start: startDate,
        end: endDate,
        label: formatPeriodLabel(new Date(startDate), new Date(endDate))
      },
      currency: 'USD',
      generated_at: new Date().toISOString(),
      opening_balance_cents: 0,
      closing_balance_cents: net,
      net_change_cents: net,
      inflows: {
        total_cents: inflowTotal,
        categories: []
      },
      outflows: {
        total_cents: outflowTotal,
        categories: []
      },
      by_period: dailyBreakdown.map((row) => ({
        period: row.date,
        period_label: row.date,
        opening_cents: row.running_balance_cents - row.net_cents,
        inflows_cents: row.inflows_cents,
        outflows_cents: row.outflows_cents,
        net_cents: row.net_cents,
        closing_cents: row.running_balance_cents
      }))
    };
  }

  private async fetchIncomeData(
    organizationId: string,
    start: string,
    end: string,
    comparison?: { start: string; end: string } | null
  ) {
    const queryText = `
      SELECT
        c.id as category_id,
        c.name as category_name,
        COALESCE(SUM(le.amount_cents), 0) as amount_cents,
        COUNT(le.id) as transaction_count
      FROM categories c
      LEFT JOIN ledger_entries le ON c.id = le.category_id
        AND le.organization_id = $1
        AND le.type = 'income'
        AND le.date >= $2 AND le.date <= $3
      WHERE c.organization_id = $1 AND c.type = 'income'
      GROUP BY c.id, c.name
      ORDER BY amount_cents DESC
    `;

    const currentResult = await query<any>(queryText, [organizationId, start, end]);
    let comparisonResult: any[] | null = null;

    if (comparison) {
      const comparisonRows = await query<any>(queryText, [organizationId, comparison.start, comparison.end]);
      comparisonResult = comparisonRows.rows;
    }

    const categories = currentResult.rows.map((row: any) => {
      const compRow = comparisonResult?.find((c) => c.category_id === row.category_id);
      const comparisonCents = compRow ? Number(compRow.amount_cents) : 0;
      return {
        category_id: row.category_id,
        category_name: row.category_name,
        amount_cents: Number(row.amount_cents),
        comparison_cents: comparison ? comparisonCents : undefined,
        change_percentage: comparison
          ? calculateChangePercentage(Number(row.amount_cents), comparisonCents)
          : undefined,
        percentage_of_total: 0,
        transaction_count: Number(row.transaction_count)
      };
    });

    const total_cents = categories.reduce((sum, c) => sum + c.amount_cents, 0);
    const comparison_cents = comparison
      ? categories.reduce((sum, c) => sum + (c.comparison_cents || 0), 0)
      : undefined;

    categories.forEach((category) => {
      category.percentage_of_total = total_cents > 0 ? (category.amount_cents / total_cents) * 100 : 0;
    });

    return {
      total_cents,
      comparison_cents,
      change_percentage: comparison
        ? calculateChangePercentage(total_cents, comparison_cents || 0)
        : undefined,
      categories: categories.filter((c) => c.amount_cents > 0 || (c.comparison_cents || 0) > 0)
    };
  }

  private async fetchExpenseData(
    organizationId: string,
    start: string,
    end: string,
    comparison?: { start: string; end: string } | null
  ) {
    const queryText = `
      SELECT
        c.id as category_id,
        c.name as category_name,
        c.tax_category,
        c.is_tax_deductible,
        COALESCE(SUM(le.amount_cents), 0) as amount_cents,
        COUNT(le.id) as transaction_count
      FROM categories c
      LEFT JOIN ledger_entries le ON c.id = le.category_id
        AND le.organization_id = $1
        AND le.type = 'expense'
        AND le.date >= $2 AND le.date <= $3
      WHERE c.organization_id = $1 AND c.type = 'expense'
      GROUP BY c.id, c.name, c.tax_category, c.is_tax_deductible
      ORDER BY amount_cents DESC
    `;

    const currentResult = await query<any>(queryText, [organizationId, start, end]);
    let comparisonResult: any[] | null = null;

    if (comparison) {
      const comparisonRows = await query<any>(queryText, [organizationId, comparison.start, comparison.end]);
      comparisonResult = comparisonRows.rows;
    }

    const incomeTotal = await this.getIncomeTotal(organizationId, start, end);

    const categories = currentResult.rows.map((row: any) => {
      const compRow = comparisonResult?.find((c) => c.category_id === row.category_id);
      const comparisonCents = compRow ? Number(compRow.amount_cents) : 0;

      return {
        category_id: row.category_id,
        category_name: row.category_name,
        tax_category: row.tax_category,
        amount_cents: Number(row.amount_cents),
        comparison_cents: comparison ? comparisonCents : undefined,
        change_percentage: comparison
          ? calculateChangePercentage(Number(row.amount_cents), comparisonCents)
          : undefined,
        percentage_of_total: 0,
        percentage_of_income: incomeTotal > 0 ? (Number(row.amount_cents) / incomeTotal) * 100 : 0,
        transaction_count: Number(row.transaction_count),
        is_tax_deductible: row.is_tax_deductible
      };
    });

    const total_cents = categories.reduce((sum, c) => sum + c.amount_cents, 0);
    const comparison_cents = comparison
      ? categories.reduce((sum, c) => sum + (c.comparison_cents || 0), 0)
      : undefined;

    categories.forEach((category) => {
      category.percentage_of_total = total_cents > 0 ? (category.amount_cents / total_cents) * 100 : 0;
    });

    return {
      total_cents,
      comparison_cents,
      change_percentage: comparison
        ? calculateChangePercentage(total_cents, comparison_cents || 0)
        : undefined,
      categories: categories.filter((c) => c.amount_cents > 0 || (c.comparison_cents || 0) > 0)
    };
  }

  private async getIncomeTotal(organizationId: string, start: string, end: string) {
    const result = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = 'income'
         AND date >= $2 AND date <= $3`,
      [organizationId, start, end]
    );

    return Number(result.rows[0]?.total || 0);
  }

  private getComparisonPeriod(
    startDate: string,
    endDate: string,
    mode: 'previous_period' | 'same_period_last_year'
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (mode === 'same_period_last_year') {
      return {
        start: toIsoDate(subYears(start, 1)),
        end: toIsoDate(subYears(end, 1))
      };
    }

    const days = Math.max(0, differenceInDays(end, start));
    const previousEnd = addDays(start, -1);
    const previousStart = addDays(previousEnd, -days);

    return {
      start: toIsoDate(previousStart),
      end: toIsoDate(previousEnd)
    };
  }

  private async getOrganization(organizationId: string) {
    const result = await query<{ name: string; currency: string }>(
      `SELECT name, currency FROM organizations WHERE id = $1`,
      [organizationId]
    );

    return result.rows[0] || { name: 'Organization', currency: 'USD' };
  }
}
