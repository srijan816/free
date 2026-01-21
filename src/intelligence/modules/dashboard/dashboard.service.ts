import { addMonths, format, subMonths } from 'date-fns';
import { query } from '../../database/db.js';
import { calculateChangePercentage, determineTrend } from '../../common/utils/calculation.utils.js';
import { formatMoney } from '../../common/utils/money.utils.js';
import { getPeriodRange, toIsoDate } from '../../common/utils/date.utils.js';
import { DashboardData, MetricWithComparison } from './interfaces/dashboard.interface.js';
import { TaxService } from '../tax/tax.service.js';
import { InsightsService } from '../insights/insights.service.js';

export class DashboardService {
  constructor(
    private readonly taxService: TaxService,
    private readonly insightsService: InsightsService
  ) {}

  async getDashboard(
    organizationId: string,
    period: string = 'this_month',
    startDate?: string,
    endDate?: string
  ): Promise<DashboardData> {
    const range = getPeriodRange(period as any, startDate, endDate);

    const [
      income,
      expenses,
      invoices,
      cashPosition,
      recentActivity,
      actionItems,
      insights,
      chartData
    ] = await Promise.all([
      this.calculateIncome(organizationId, range.start, range.end, range.previousStart, range.previousEnd),
      this.calculateExpenses(organizationId, range.start, range.end, range.previousStart, range.previousEnd),
      this.getInvoiceMetrics(organizationId),
      this.getBankBalances(organizationId),
      this.getRecentActivity(organizationId, 10),
      this.getActionItems(organizationId),
      this.insightsService.listInsights(organizationId, 3, 0),
      this.buildChartData(organizationId, range.end)
    ]);

    const netProfitCurrent = income.current_cents - expenses.current_cents;
    const netProfitPrevious = income.previous_cents - expenses.previous_cents;

    const netProfit = {
      current_cents: netProfitCurrent,
      previous_cents: netProfitPrevious,
      change_percentage: calculateChangePercentage(netProfitCurrent, netProfitPrevious),
      margin_percentage: income.current_cents > 0 ? (netProfitCurrent / income.current_cents) * 100 : 0
    };

    const taxEstimate = await this.taxService.calculateTaxEstimate(organizationId);
    const unpaidBillsCents = await this.getUnpaidBills(organizationId);
    const trueLiquidBalance = cashPosition.total_cents - unpaidBillsCents - taxEstimate.total_tax_cents;

    return {
      period: {
        start: toIsoDate(range.start),
        end: toIsoDate(range.end),
        label: range.label
      },
      metrics: {
        income,
        expenses,
        net_profit: netProfit,
        outstanding_invoices: invoices,
        cash_position: {
          ...cashPosition,
          unpaid_bills_cents: unpaidBillsCents,
          true_liquid_balance_cents: trueLiquidBalance
        },
        estimated_taxes: {
          year_to_date_cents: taxEstimate.total_tax_cents,
          quarterly_payment_cents: taxEstimate.quarterly_payment_cents,
          next_due_date: taxEstimate.quarterly_breakdown[0]?.due_date || ''
        }
      },
      charts: chartData,
      recent_activity: recentActivity,
      action_items: actionItems,
      insights: insights.items.map((insight) => ({
        id: insight.id,
        type: insight.type,
        severity: insight.severity,
        title: insight.title,
        description: insight.description,
        created_at: insight.created_at,
        action_url: insight.action_url ?? undefined,
        action_label: insight.action_label ?? undefined,
        data: insight.data
      }))
    };
  }

  private async calculateIncome(
    organizationId: string,
    start: Date,
    end: Date,
    previousStart: Date,
    previousEnd: Date
  ): Promise<MetricWithComparison> {
    const current = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = 'income'
         AND date >= $2 AND date <= $3`,
      [organizationId, toIsoDate(start), toIsoDate(end)]
    );

    const previous = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = 'income'
         AND date >= $2 AND date <= $3`,
      [organizationId, toIsoDate(previousStart), toIsoDate(previousEnd)]
    );

    const currentCents = Number(current.rows[0]?.total || 0);
    const previousCents = Number(previous.rows[0]?.total || 0);

    return {
      current_cents: currentCents,
      previous_cents: previousCents,
      change_percentage: calculateChangePercentage(currentCents, previousCents),
      trend: determineTrend(currentCents, previousCents)
    };
  }

  private async calculateExpenses(
    organizationId: string,
    start: Date,
    end: Date,
    previousStart: Date,
    previousEnd: Date
  ): Promise<MetricWithComparison> {
    const current = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = 'expense'
         AND date >= $2 AND date <= $3`,
      [organizationId, toIsoDate(start), toIsoDate(end)]
    );

    const previous = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = 'expense'
         AND date >= $2 AND date <= $3`,
      [organizationId, toIsoDate(previousStart), toIsoDate(previousEnd)]
    );

    const currentCents = Number(current.rows[0]?.total || 0);
    const previousCents = Number(previous.rows[0]?.total || 0);

    return {
      current_cents: currentCents,
      previous_cents: previousCents,
      change_percentage: calculateChangePercentage(currentCents, previousCents),
      trend: determineTrend(currentCents, previousCents)
    };
  }

  private async getInvoiceMetrics(organizationId: string) {
    const result = await query<{ count: string; total: string; overdue_count: string; overdue_total: string }>(
      `SELECT
        COUNT(*) as count,
        COALESCE(SUM(amount_due_cents), 0) as total,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN 1 ELSE 0 END), 0) as overdue_count,
        COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount_due_cents ELSE 0 END), 0) as overdue_total
       FROM invoices
       WHERE organization_id = $1
         AND status IN ('sent', 'viewed', 'partial')`,
      [organizationId]
    );

    const row = result.rows[0];

    return {
      total_cents: Number(row?.total || 0),
      count: Number(row?.count || 0),
      overdue_cents: Number(row?.overdue_total || 0),
      overdue_count: Number(row?.overdue_count || 0)
    };
  }

  private async getBankBalances(organizationId: string) {
    const result = await query<{ id: string; name: string; current_balance_cents: string }>(
      `SELECT id, name, COALESCE(current_balance_cents, 0) as current_balance_cents
       FROM bank_accounts
       WHERE organization_id = $1`,
      [organizationId]
    );

    const byAccount = result.rows.map((row) => ({
      account_id: row.id,
      account_name: row.name,
      balance_cents: Number(row.current_balance_cents || 0)
    }));

    const total = byAccount.reduce((sum, account) => sum + account.balance_cents, 0);

    return {
      total_cents: total,
      by_account: byAccount
    };
  }

  private async getUnpaidBills(organizationId: string) {
    const pendingExpenses = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM expenses
       WHERE organization_id = $1
         AND deleted_at IS NULL
         AND status IN ('pending', 'approved')
         AND is_from_bank = FALSE`,
      [organizationId]
    );

    const upcomingRecurring = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM recurring_expenses
       WHERE organization_id = $1
         AND status = 'active'
         AND next_occurrence_date <= (CURRENT_DATE + INTERVAL '30 days')`,
      [organizationId]
    );

    return Number(pendingExpenses.rows[0]?.total || 0) + Number(upcomingRecurring.rows[0]?.total || 0);
  }

  private async getRecentActivity(organizationId: string, limit: number) {
    const result = await query<{ id: string; type: string; description: string; amount_cents: string; date: string; source_id: string; source_type: string }>(
      `SELECT id, type, description, amount_cents, date, source_id, source_type
       FROM ledger_entries
       WHERE organization_id = $1
       ORDER BY date DESC
       LIMIT $2`,
      [organizationId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      type: row.type === 'income' ? 'payment_received' : 'expense_created',
      description: row.description || '',
      amount_cents: Number(row.amount_cents || 0),
      date: row.date,
      entity_id: row.source_id,
      entity_type: row.source_type
    }));
  }

  private async getActionItems(organizationId: string) {
    const items: DashboardData['action_items'] = [];

    const overdueInvoices = await query<{ count: string; total: string }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_due_cents), 0) as total
       FROM invoices
       WHERE organization_id = $1
         AND status IN ('sent', 'viewed', 'partial')
         AND due_date < CURRENT_DATE`,
      [organizationId]
    );

    const overdueCount = Number(overdueInvoices.rows[0]?.count || 0);
    const overdueTotal = Number(overdueInvoices.rows[0]?.total || 0);

    if (overdueCount > 0) {
      items.push({
        type: 'overdue_invoice',
        title: 'Overdue Invoices',
        description: `You have ${overdueCount} overdue invoice(s) totaling ${formatMoney(overdueTotal)}`,
        severity: 'critical',
        count: overdueCount,
        amount_cents: overdueTotal,
        action_url: '/invoices?status=overdue',
        action_label: 'View Invoices'
      });
    }

    const uncategorized = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM bank_transactions
       WHERE organization_id = $1
         AND is_categorized = FALSE
         AND is_excluded = FALSE`,
      [organizationId]
    );

    const needsReview = Number(uncategorized.rows[0]?.count || 0);
    if (needsReview > 0) {
      items.push({
        type: 'transactions_to_review',
        title: 'Transactions Need Review',
        description: `${needsReview} transactions need categorization`,
        severity: needsReview > 20 ? 'warning' : 'info',
        count: needsReview,
        action_url: '/transactions?filter=needs_review',
        action_label: 'Review Now'
      });
    }

    const contractors = await query<{ id: string; name: string; total: string }>(
      `SELECT v.id, v.name, SUM(e.amount_cents) as total
       FROM expenses e
       JOIN vendors v ON e.vendor_id = v.id
       WHERE e.organization_id = $1
         AND v.is_1099_vendor = TRUE
         AND EXTRACT(YEAR FROM e.date) = EXTRACT(YEAR FROM CURRENT_DATE)
       GROUP BY v.id, v.name
       HAVING SUM(e.amount_cents) >= 50000
          AND SUM(e.amount_cents) < 60000`,
      [organizationId]
    );

    contractors.rows.forEach((contractor) => {
      items.push({
        type: 'contractor_threshold',
        title: '1099 Threshold Alert',
        description: `${contractor.name} is approaching the $600 threshold (${formatMoney(Number(contractor.total || 0))} YTD)`,
        severity: 'warning',
        amount_cents: Number(contractor.total || 0),
        action_url: `/vendors/${contractor.id}`,
        action_label: 'View Contractor'
      });
    });

    return items.sort((a, b) => {
      const order: Record<string, number> = { critical: 0, warning: 1, info: 2, success: 3 };
      return (order[a.severity] ?? 3) - (order[b.severity] ?? 3);
    });
  }

  private async buildChartData(organizationId: string, end: Date) {
    const start = subMonths(end, 5);
    const trend = await query<{ period: string; income: string; expenses: string }>(
      `SELECT TO_CHAR(DATE_TRUNC('month', date), 'YYYY-MM') as period,
              SUM(CASE WHEN type = 'income' THEN amount_cents ELSE 0 END) as income,
              SUM(CASE WHEN type = 'expense' THEN amount_cents ELSE 0 END) as expenses
       FROM ledger_entries
       WHERE organization_id = $1
         AND date >= $2 AND date <= $3
       GROUP BY DATE_TRUNC('month', date)
       ORDER BY DATE_TRUNC('month', date)`,
      [organizationId, toIsoDate(start), toIsoDate(end)]
    );

    const incomeExpenseTrend = trend.rows.map((row) => {
      const income = Number(row.income || 0);
      const expenses = Number(row.expenses || 0);
      return {
        period: row.period,
        income_cents: income,
        expenses_cents: expenses,
        net_cents: income - expenses
      };
    });

    const categoryResult = await query<{ id: string; name: string; color: string | null; total: string }>(
      `SELECT c.id, c.name, c.color, COALESCE(SUM(le.amount_cents), 0) as total
       FROM categories c
       LEFT JOIN ledger_entries le ON c.id = le.category_id
         AND le.organization_id = $1
         AND le.type = 'expense'
         AND le.date >= $2 AND le.date <= $3
       WHERE c.organization_id = $1 AND c.type = 'expense'
       GROUP BY c.id, c.name, c.color
       ORDER BY total DESC
       LIMIT 6`,
      [organizationId, toIsoDate(start), toIsoDate(end)]
    );

    const totalExpenses = categoryResult.rows.reduce((sum, row) => sum + Number(row.total || 0), 0);

    const expenseByCategory = categoryResult.rows.map((row) => ({
      category_id: row.id,
      category_name: row.name,
      amount_cents: Number(row.total || 0),
      percentage: totalExpenses > 0 ? (Number(row.total || 0) / totalExpenses) * 100 : 0,
      color: row.color
    }));

    const incomeByClientResult = await query<{ id: string; name: string; total: string }>(
      `SELECT c.id, c.name, COALESCE(SUM(p.amount_cents), 0) as total
       FROM clients c
       JOIN payments p ON c.id = p.client_id
       WHERE c.organization_id = $1
         AND p.paid_at >= $2 AND p.paid_at <= $3
       GROUP BY c.id, c.name
       ORDER BY total DESC
       LIMIT 6`,
      [organizationId, toIsoDate(start), toIsoDate(end)]
    );

    const totalIncome = incomeByClientResult.rows.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const incomeByClient = incomeByClientResult.rows.map((row) => ({
      client_id: row.id,
      client_name: row.name,
      amount_cents: Number(row.total || 0),
      percentage: totalIncome > 0 ? (Number(row.total || 0) / totalIncome) * 100 : 0
    }));

    return {
      income_expense_trend: incomeExpenseTrend,
      expense_by_category: expenseByCategory,
      income_by_client: incomeByClient
    };
  }
}
