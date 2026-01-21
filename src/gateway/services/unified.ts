import { config } from '../config.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';

export async function getUnifiedDashboard(organizationId: string, query: Record<string, any>, headers: Record<string, string>) {
  const dashboard = await fetchJson(`${config.part3Url}/api/v1/dashboard`, query, headers);
  const invoices = await fetchJson(`${config.part1Url}/api/v1/invoices`, { page: 1, per_page: 5 }, headers, true);
  const expenses = await fetchJson(`${config.part2Url}/api/v1/expenses`, { page: 1, per_page: 5 }, headers, true);

  const data = dashboard?.data || dashboard || {};
  const recentInvoices = invoices?.data || [];
  const recentExpenses = expenses?.data || [];
  const unreadNotifications: any[] = [];

  return {
    summary: data.metrics || {},
    charts: data.charts || {},
    tax_estimate: data.metrics?.estimated_taxes || null,
    cash_position: data.metrics?.cash_position || null,
    insights: data.insights || [],
    receivables: {
      total_outstanding: data.metrics?.outstanding_invoices?.total_cents ?? 0,
      overdue_count: data.metrics?.outstanding_invoices?.overdue_count ?? 0,
      recent_invoices: recentInvoices
    },
    banking: {
      total_balance: data.metrics?.cash_position?.total_cents ?? 0,
      accounts: data.metrics?.cash_position?.by_account ?? [],
      recent_expenses: recentExpenses
    },
    notifications: unreadNotifications,
    recent_activity: data.recent_activity || [],
    meta: {
      period: query?.period || 'this_month',
      currency: 'USD',
      computed_at: new Date().toISOString()
    }
  };
}

export async function getQuickSummary(organizationId: string, headers: Record<string, string>) {
  const dashboard = await fetchJson(`${config.part3Url}/api/v1/dashboard`, { period: 'this_month' }, headers);
  const data = dashboard?.data || dashboard || {};

  return {
    income_this_month: data.metrics?.income?.current_cents ?? 0,
    expenses_this_month: data.metrics?.expenses?.current_cents ?? 0,
    net_this_month: data.metrics?.net_profit?.current_cents ?? 0,
    outstanding_invoices: data.metrics?.outstanding_invoices?.total_cents ?? 0,
    overdue_invoices: data.metrics?.outstanding_invoices?.overdue_cents ?? 0,
    bank_balance: data.metrics?.cash_position?.total_cents ?? 0,
    pending_expenses: 0
  };
}

export async function getRecentActivity(headers: Record<string, string>) {
  const dashboard = await fetchJson(`${config.part3Url}/api/v1/dashboard`, { period: 'this_month' }, headers);
  const data = dashboard?.data || dashboard || {};
  const activities = data.recent_activity || [];
  return {
    activities,
    pagination: {
      total: activities.length,
      limit: activities.length,
      offset: 0,
      has_more: false
    }
  };
}

async function fetchJson(
  baseUrl: string,
  query: Record<string, any> | undefined,
  headers: Record<string, string>,
  allowFailure: boolean = false
) {
  const url = appendQuery(baseUrl, query);
  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (allowFailure) {
      return null;
    }
    throw new ApiError({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Upstream service unavailable',
      statusCode: response.status
    });
  }
  return response.json();
}

function appendQuery(url: string, query?: Record<string, any>) {
  if (!query || Object.keys(query).length === 0) return url;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    searchParams.set(key, String(value));
  }
  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}
