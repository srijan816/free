import { InsightSeverity, InsightType } from '../../../common/constants/insight-types.js';

export interface DashboardData {
  period: {
    start: string;
    end: string;
    label: string;
  };
  metrics: {
    income: MetricWithComparison;
    expenses: MetricWithComparison;
    net_profit: {
      current_cents: number;
      previous_cents: number;
      change_percentage: number;
      margin_percentage: number;
    };
    outstanding_invoices: {
      total_cents: number;
      count: number;
      overdue_cents: number;
      overdue_count: number;
    };
    cash_position: {
      total_cents: number;
      unpaid_bills_cents: number;
      true_liquid_balance_cents: number;
      by_account: Array<{
        account_id: string;
        account_name: string;
        balance_cents: number;
      }>;
    };
    estimated_taxes: {
      year_to_date_cents: number;
      quarterly_payment_cents: number;
      next_due_date: string;
    };
  };
  charts: {
    income_expense_trend: Array<{
      period: string;
      income_cents: number;
      expenses_cents: number;
      net_cents: number;
    }>;
    expense_by_category: Array<{
      category_id: string;
      category_name: string;
      amount_cents: number;
      percentage: number;
      color: string | null;
    }>;
    income_by_client: Array<{
      client_id: string;
      client_name: string;
      amount_cents: number;
      percentage: number;
    }>;
  };
  recent_activity: Array<{
    id: string;
    type: string;
    description: string;
    amount_cents: number;
    date: string;
    entity_id: string;
    entity_type: string;
  }>;
  action_items: Array<{
    type: string;
    title: string;
    description: string;
    severity: InsightSeverity;
    count?: number;
    amount_cents?: number;
    action_url: string;
    action_label: string;
  }>;
  insights: Array<{
    id: string;
    type: InsightType;
    severity: InsightSeverity;
    title: string;
    description: string;
    data?: Record<string, unknown>;
    action_url?: string;
    action_label?: string;
    created_at: string;
  }>;
}

export interface MetricWithComparison {
  current_cents: number;
  previous_cents: number;
  change_percentage: number;
  trend: 'up' | 'down' | 'stable';
}
