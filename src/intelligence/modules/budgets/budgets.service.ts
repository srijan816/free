import { query } from '../../database/db.js';

export class BudgetsService {
  async listBudgets(organizationId: string) {
    const budgetsResult = await query<any>(
      `SELECT * FROM budgets WHERE organization_id = $1 ORDER BY created_at DESC`,
      [organizationId]
    );

    const budgetIds = budgetsResult.rows.map((b) => b.id);
    const categoriesResult = budgetIds.length > 0
      ? await query<any>(
          `SELECT bc.*, c.name as category_name
           FROM budget_categories bc
           JOIN categories c ON bc.category_id = c.id
           WHERE bc.budget_id = ANY($1::uuid[])`,
          [budgetIds]
        )
      : { rows: [] };

    const categoriesByBudget = new Map<string, any[]>();
    categoriesResult.rows.forEach((row: any) => {
      if (!categoriesByBudget.has(row.budget_id)) {
        categoriesByBudget.set(row.budget_id, []);
      }
      categoriesByBudget.get(row.budget_id)!.push(row);
    });

    return budgetsResult.rows.map((budget: any) => ({
      ...budget,
      categories: categoriesByBudget.get(budget.id) || []
    }));
  }

  async createBudget(organizationId: string, payload: any) {
    const result = await query<{ id: string }>(
      `INSERT INTO budgets (
        organization_id,
        name,
        budget_year,
        period_type,
        total_budget_cents,
        alert_at_percent,
        is_active,
        currency,
        created_by_user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, TRUE, $7, $8)
      RETURNING id`,
      [
        organizationId,
        payload.name,
        payload.budget_year,
        payload.period_type || 'monthly',
        payload.total_budget_cents,
        payload.alert_at_percent || 80,
        payload.currency || 'USD',
        payload.created_by_user_id || null
      ]
    );

    const budgetId = result.rows[0].id;

    if (payload.categories?.length) {
      for (const category of payload.categories) {
        await query(
          `INSERT INTO budget_categories (budget_id, category_id, budgeted_cents)
           VALUES ($1, $2, $3)`,
          [budgetId, category.category_id, category.budgeted_cents]
        );
      }
    }

    return { id: budgetId };
  }
}
