import { createHash } from 'crypto';
import { endOfMonth, startOfMonth, subMonths } from 'date-fns';
import { query } from '../../database/db.js';
import { INSIGHT_SEVERITY, INSIGHT_TYPES, InsightSeverity, InsightType } from '../../common/constants/insight-types.js';
import { calculateChangePercentage } from '../../common/utils/calculation.utils.js';
import { toIsoDate } from '../../common/utils/date.utils.js';
import { eventBus } from '../../integrations/event-bus.js';

export interface InsightRecord {
  id: string;
  type: InsightType;
  severity: InsightSeverity;
  title: string;
  description: string;
  data?: Record<string, unknown>;
  action_url?: string | null;
  action_label?: string | null;
  created_at: string;
}

export class InsightsService {
  async listInsights(organizationId: string, limit: number, offset: number) {
    const totalResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM insights
       WHERE organization_id = $1
         AND is_dismissed = FALSE`,
      [organizationId]
    );

    const unreadResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM insights
       WHERE organization_id = $1
         AND is_dismissed = FALSE
         AND is_read = FALSE`,
      [organizationId]
    );

    const result = await query<{
      id: string;
      insight_type: InsightType;
      severity: InsightSeverity;
      title: string;
      description: string;
      data_points: Record<string, unknown>;
      action_url: string | null;
      action_label: string | null;
      created_at: string;
    }>(
      `SELECT id, insight_type, severity, title, description, data_points, action_url, action_label, created_at
       FROM insights
       WHERE organization_id = $1
         AND is_dismissed = FALSE
       ORDER BY priority_score DESC, created_at DESC
       LIMIT $2 OFFSET $3`,
      [organizationId, limit, offset]
    );

    return {
      total: Number(totalResult.rows[0]?.count || 0),
      unreadCount: Number(unreadResult.rows[0]?.count || 0),
      items: result.rows.map((row) => ({
        id: row.id,
        type: row.insight_type,
        severity: row.severity,
        title: row.title,
        description: row.description,
        data: row.data_points,
        action_url: row.action_url,
        action_label: row.action_label,
        created_at: row.created_at
      }))
    };
  }

  async generateInsights(organizationId: string): Promise<InsightRecord[]> {
    const insights: InsightRecord[] = [];

    const metrics = await this.gatherMetrics(organizationId);

    if (metrics.expenseChangePercent >= 30) {
      insights.push(await this.createInsight(organizationId, {
        type: INSIGHT_TYPES.ANOMALY,
        severity: INSIGHT_SEVERITY.WARNING,
        title: 'Spending increased significantly',
        description: `Your expenses are up ${metrics.expenseChangePercent.toFixed(1)}% compared to last month.`,
        data: {
          metric: 'monthly_expenses',
          current_value: metrics.currentMonthExpenses,
          previous_value: metrics.lastMonthExpenses,
          change_percentage: metrics.expenseChangePercent
        }
      }));
    }

    if (metrics.topClientPercent >= 0.5 && metrics.topClientName) {
      insights.push(await this.createInsight(organizationId, {
        type: INSIGHT_TYPES.RECOMMENDATION,
        severity: INSIGHT_SEVERITY.WARNING,
        title: 'Diversification suggestion',
        description: `${metrics.topClientName} represents ${(metrics.topClientPercent * 100).toFixed(0)}% of your income. Consider diversifying your client base.`,
        data: {
          metric: 'top_client_percentage',
          current_value: metrics.topClientPercent,
          client: metrics.topClientName
        }
      }));
    }

    if (metrics.overdueCount > 0) {
      insights.push(await this.createInsight(organizationId, {
        type: INSIGHT_TYPES.ALERT,
        severity: INSIGHT_SEVERITY.WARNING,
        title: 'Invoices need attention',
        description: `You have ${metrics.overdueCount} overdue invoice(s) totaling ${metrics.overdueTotal} cents.`,
        data: {
          metric: 'overdue_invoice_count',
          current_value: metrics.overdueCount
        }
      }));
    }

    return insights;
  }

  async markRead(organizationId: string, insightId: string) {
    await query(
      `UPDATE insights
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [insightId, organizationId]
    );
  }

  async dismiss(organizationId: string, insightId: string) {
    await query(
      `UPDATE insights
       SET is_dismissed = TRUE, dismissed_at = NOW()
       WHERE id = $1 AND organization_id = $2`,
      [insightId, organizationId]
    );
  }

  private async gatherMetrics(organizationId: string) {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(subMonths(now, 1));
    const lastMonthEnd = endOfMonth(subMonths(now, 1));

    const currentExpenses = await this.sumLedger(organizationId, 'expense', monthStart, now);
    const lastMonthExpenses = await this.sumLedger(organizationId, 'expense', lastMonthStart, lastMonthEnd);

    const expenseChangePercent = calculateChangePercentage(currentExpenses, lastMonthExpenses);

    const topClientResult = await query<{ name: string; total: string }>(
      `SELECT c.name, SUM(p.amount_cents) as total
       FROM clients c
       JOIN payments p ON c.id = p.client_id
       WHERE c.organization_id = $1
         AND p.paid_at >= $2
       GROUP BY c.name
       ORDER BY total DESC
       LIMIT 1`,
      [organizationId, toIsoDate(startOfMonth(now))]
    );

    const topClientTotal = Number(topClientResult.rows[0]?.total || 0);

    const totalIncome = await this.sumLedger(organizationId, 'income', startOfMonth(now), now);
    const topClientPercent = totalIncome > 0 ? topClientTotal / totalIncome : 0;

    const overdueResult = await query<{ count: string; total: string }>(
      `SELECT COUNT(*) as count, COALESCE(SUM(amount_due_cents), 0) as total
       FROM invoices
       WHERE organization_id = $1
         AND status IN ('sent', 'viewed', 'partial')
         AND due_date < CURRENT_DATE`,
      [organizationId]
    );

    return {
      currentMonthExpenses: currentExpenses,
      lastMonthExpenses,
      expenseChangePercent,
      topClientName: topClientResult.rows[0]?.name || null,
      topClientPercent,
      overdueCount: Number(overdueResult.rows[0]?.count || 0),
      overdueTotal: Number(overdueResult.rows[0]?.total || 0)
    };
  }

  private async sumLedger(
    organizationId: string,
    type: 'income' | 'expense',
    start: Date,
    end: Date
  ) {
    const result = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = $2
         AND date >= $3 AND date <= $4`,
      [organizationId, type, toIsoDate(start), toIsoDate(end)]
    );

    return Number(result.rows[0]?.total || 0);
  }

  private async createInsight(
    organizationId: string,
    input: {
      type: InsightType;
      severity: InsightSeverity;
      title: string;
      description: string;
      data?: Record<string, unknown>;
      action_url?: string;
      action_label?: string;
    }
  ): Promise<InsightRecord> {
    const hashSource = `${organizationId}:${input.type}:${input.title}:${JSON.stringify(input.data || {})}`;
    const hash = createHash('sha256').update(hashSource).digest('hex');

    const existing = await query<{ id: string }>(
      `SELECT id FROM insights WHERE organization_id = $1 AND insight_hash = $2 AND is_dismissed = FALSE`,
      [organizationId, hash]
    );

    if (existing.rows.length > 0) {
      const row = existing.rows[0];
      return {
        id: row.id,
        type: input.type,
        severity: input.severity,
        title: input.title,
        description: input.description,
        data: input.data,
        action_url: input.action_url,
        action_label: input.action_label,
        created_at: new Date().toISOString()
      };
    }

    const inserted = await query<{ id: string; created_at: string }>(
      `INSERT INTO insights (
        organization_id,
        insight_type,
        severity,
        title,
        description,
        data_points,
        action_url,
        action_label,
        insight_hash
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING id, created_at`,
      [
        organizationId,
        input.type,
        input.severity,
        input.title,
        input.description,
        input.data || {},
        input.action_url || null,
        input.action_label || null,
        hash
      ]
    );

    const record = {
      id: inserted.rows[0].id,
      type: input.type,
      severity: input.severity,
      title: input.title,
      description: input.description,
      data: input.data,
      action_url: input.action_url,
      action_label: input.action_label,
      created_at: inserted.rows[0].created_at
    };

    eventBus.publish('insight.created', {
      organization_id: organizationId,
      insight_id: record.id,
      type: record.type,
      severity: record.severity,
      title: record.title,
      description: record.description,
      data: record.data ?? {},
      action_url: record.action_url ?? null,
      action_label: record.action_label ?? null,
      created_at: record.created_at
    });

    return record;
  }
}
