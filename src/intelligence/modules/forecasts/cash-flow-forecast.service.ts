import { addDays, format, isSameDay } from 'date-fns';
import { query } from '../../database/db.js';

export interface CashFlowForecast {
  generated_at: string;
  organization_id: string;
  currency: string;
  current_balance_cents: number;
  current_date: string;
  horizon_days: number;
  confidence_level: number;
  forecast: Array<{
    date: string;
    projected_balance_cents: number;
    projected_balance_low_cents: number;
    projected_balance_high_cents: number;
    expected_inflows: Array<{ type: string; description: string; amount_cents: number; probability: number; source_id?: string }>;
    expected_outflows: Array<{ type: string; description: string; amount_cents: number; probability: number; source_id?: string }>;
    net_change_cents: number;
  }>;
  summary: {
    end_balance_cents: number;
    end_balance_low_cents: number;
    end_balance_high_cents: number;
    total_expected_inflows_cents: number;
    total_expected_outflows_cents: number;
    days_until_negative?: number;
    lowest_balance_cents: number;
    lowest_balance_date: string;
    monthly_burn_rate_cents: number;
    runway_months?: number;
    upcoming_large_inflows: Array<{ date: string; description: string; amount_cents: number }>;
    upcoming_large_outflows: Array<{ date: string; description: string; amount_cents: number }>;
  };
  assumptions: {
    invoice_payment_rate: number;
    average_days_to_payment: number;
    expense_growth_rate: number;
    income_seasonality_applied: boolean;
  };
}

export class CashFlowForecastService {
  async generateForecast(organizationId: string, horizonDays: number = 90): Promise<CashFlowForecast> {
    const today = new Date();

    const currentBalance = await this.getCurrentBalance(organizationId);
    const outstandingInvoices = await this.getOutstandingInvoices(organizationId);
    const recurringExpenses = await this.getRecurringExpenses(organizationId);
    const recurringIncome = await this.getRecurringIncome(organizationId);

    const forecast = [] as CashFlowForecast['forecast'];
    let runningBalance = currentBalance;
    let lowestBalance = currentBalance;
    let lowestBalanceDate = today;

    for (let i = 0; i <= horizonDays; i += 1) {
      const date = addDays(today, i);
      const dateStr = format(date, 'yyyy-MM-dd');

      const dayForecast = {
        date: dateStr,
        projected_balance_cents: runningBalance,
        projected_balance_low_cents: 0,
        projected_balance_high_cents: 0,
        expected_inflows: [] as CashFlowForecast['forecast'][number]['expected_inflows'],
        expected_outflows: [] as CashFlowForecast['forecast'][number]['expected_outflows'],
        net_change_cents: 0
      };

      for (const invoice of outstandingInvoices) {
        const dueDate = new Date(invoice.due_date);
        if (isSameDay(dueDate, date)) {
          dayForecast.expected_inflows.push({
            type: 'invoice_payment',
            description: `Invoice ${invoice.invoice_number}`,
            amount_cents: invoice.amount_due_cents,
            probability: 0.85,
            source_id: invoice.id
          });
        }
      }

      for (const recurring of recurringIncome) {
        if (this.isRecurringDue(recurring.next_issue_date, date)) {
          dayForecast.expected_inflows.push({
            type: 'recurring_income',
            description: recurring.description || 'Recurring income',
            amount_cents: recurring.amount_cents,
            probability: 0.95,
            source_id: recurring.id
          });
        }
      }

      for (const expense of recurringExpenses) {
        if (this.isRecurringDue(expense.next_occurrence_date, date)) {
          dayForecast.expected_outflows.push({
            type: 'recurring_expense',
            description: expense.description || 'Recurring expense',
            amount_cents: expense.amount_cents,
            probability: 0.95,
            source_id: expense.id
          });
        }
      }

      const totalInflows = dayForecast.expected_inflows.reduce(
        (sum, inflow) => sum + inflow.amount_cents * inflow.probability,
        0
      );
      const totalOutflows = dayForecast.expected_outflows.reduce(
        (sum, outflow) => sum + outflow.amount_cents * outflow.probability,
        0
      );

      dayForecast.net_change_cents = Math.round(totalInflows - totalOutflows);
      runningBalance += dayForecast.net_change_cents;
      dayForecast.projected_balance_cents = runningBalance;
      dayForecast.projected_balance_low_cents = Math.round(runningBalance * 0.9);
      dayForecast.projected_balance_high_cents = Math.round(runningBalance * 1.1);

      if (runningBalance < lowestBalance) {
        lowestBalance = runningBalance;
        lowestBalanceDate = date;
      }

      forecast.push(dayForecast);
    }

    const daysUntilNegative = forecast.findIndex((day) => day.projected_balance_cents < 0);
    const totalExpectedInflows = forecast.reduce(
      (sum, day) => sum + day.expected_inflows.reduce((s, i) => s + i.amount_cents, 0),
      0
    );
    const totalExpectedOutflows = forecast.reduce(
      (sum, day) => sum + day.expected_outflows.reduce((s, o) => s + o.amount_cents, 0),
      0
    );

    const monthlyBurnRate = Math.round(totalExpectedOutflows / Math.max(1, horizonDays / 30));

    return {
      generated_at: new Date().toISOString(),
      organization_id: organizationId,
      currency: 'USD',
      current_balance_cents: currentBalance,
      current_date: format(today, 'yyyy-MM-dd'),
      horizon_days: horizonDays,
      confidence_level: 75,
      forecast,
      summary: {
        end_balance_cents: forecast[forecast.length - 1].projected_balance_cents,
        end_balance_low_cents: forecast[forecast.length - 1].projected_balance_low_cents,
        end_balance_high_cents: forecast[forecast.length - 1].projected_balance_high_cents,
        total_expected_inflows_cents: totalExpectedInflows,
        total_expected_outflows_cents: totalExpectedOutflows,
        days_until_negative: daysUntilNegative >= 0 ? daysUntilNegative : undefined,
        lowest_balance_cents: lowestBalance,
        lowest_balance_date: format(lowestBalanceDate, 'yyyy-MM-dd'),
        monthly_burn_rate_cents: monthlyBurnRate,
        runway_months: currentBalance > 0 && monthlyBurnRate > 0
          ? Math.floor(currentBalance / monthlyBurnRate)
          : undefined,
        upcoming_large_inflows: this.extractLargeItems(forecast, 'expected_inflows', 5),
        upcoming_large_outflows: this.extractLargeItems(forecast, 'expected_outflows', 5)
      },
      assumptions: {
        invoice_payment_rate: 0.85,
        average_days_to_payment: 7,
        expense_growth_rate: 0,
        income_seasonality_applied: false
      }
    };
  }

  private async getCurrentBalance(organizationId: string) {
    const result = await query<{ total: string }>(
      `SELECT COALESCE(SUM(current_balance_cents), 0) as total
       FROM bank_accounts
       WHERE organization_id = $1`,
      [organizationId]
    );

    return Number(result.rows[0]?.total || 0);
  }

  private async getOutstandingInvoices(organizationId: string) {
    const result = await query<any>(
      `SELECT id, invoice_number, amount_due_cents, due_date
       FROM invoices
       WHERE organization_id = $1
         AND status IN ('sent', 'viewed', 'partial')`,
      [organizationId]
    );

    return result.rows;
  }

  private async getRecurringExpenses(organizationId: string) {
    const result = await query<any>(
      `SELECT id, amount_cents, next_occurrence_date, description
       FROM recurring_expenses
       WHERE organization_id = $1
         AND status = 'active'`,
      [organizationId]
    );

    return result.rows;
  }

  private async getRecurringIncome(organizationId: string) {
    const result = await query<any>(
      `SELECT id, next_issue_date, template, frequency
       FROM recurring_schedules
       WHERE organization_id = $1
         AND status = 'active'`,
      [organizationId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      next_issue_date: row.next_issue_date,
      amount_cents: row.template?.total_cents || 0,
      description: row.template?.description || 'Recurring income',
      frequency: row.frequency
    }));
  }

  private isRecurringDue(nextDate: string, targetDate: Date) {
    if (!nextDate) return false;
    const dueDate = new Date(nextDate);
    return isSameDay(dueDate, targetDate);
  }

  private extractLargeItems(
    forecast: CashFlowForecast['forecast'],
    key: 'expected_inflows' | 'expected_outflows',
    limit: number
  ) {
    const items: Array<{ date: string; description: string; amount_cents: number }> = [];

    forecast.forEach((day) => {
      day[key].forEach((item) => {
        items.push({
          date: day.date,
          description: item.description,
          amount_cents: item.amount_cents
        });
      });
    });

    return items.sort((a, b) => b.amount_cents - a.amount_cents).slice(0, limit);
  }
}
