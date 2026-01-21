import { query } from '../../database/db.js';
import { ScheduleCRepository } from './repositories/schedule-c.repository.js';

export class ScheduleCService {
  private readonly scheduleCRepo: ScheduleCRepository;

  constructor() {
    this.scheduleCRepo = new ScheduleCRepository();
  }

  async generateScheduleC(organizationId: string, taxYear: number) {
    const yearStart = `${taxYear}-01-01`;
    const yearEnd = `${taxYear}-12-31`;

    const incomeResult = await query<{ total: string }>(
      `SELECT COALESCE(SUM(amount_cents), 0) as total
       FROM ledger_entries
       WHERE organization_id = $1
         AND type = 'income'
         AND date >= $2 AND date <= $3`,
      [organizationId, yearStart, yearEnd]
    );

    const grossReceipts = Number(incomeResult.rows[0]?.total || 0);

    const expenseResult = await query<{ tax_category: string; total: string; details: any }>(
      `SELECT c.tax_category,
              COALESCE(SUM(le.amount_cents), 0) as total,
              json_agg(json_build_object(
                'date', le.date,
                'description', le.description,
                'amount_cents', le.amount_cents
              )) as details
       FROM ledger_entries le
       JOIN categories c ON le.category_id = c.id
       WHERE le.organization_id = $1
         AND le.type = 'expense'
         AND le.date >= $2 AND le.date <= $3
         AND c.is_tax_deductible = TRUE
       GROUP BY c.tax_category`,
      [organizationId, yearStart, yearEnd]
    );

    const expenseMap = new Map<string, number>();
    const detailsMap = new Map<string, any[]>();

    expenseResult.rows.forEach((row) => {
      expenseMap.set(row.tax_category, Number(row.total || 0));
      detailsMap.set(row.tax_category, row.details || []);
    });

    const getExpense = (lineKey: string) => expenseMap.get(lineKey) || 0;
    const mealsTotal = getExpense('schedule_c_line_24b');
    const mealsDeductible = Math.round(mealsTotal * 0.5);

    const totalExpenses =
      getExpense('schedule_c_line_8') +
      getExpense('schedule_c_line_9') +
      getExpense('schedule_c_line_10') +
      getExpense('schedule_c_line_11') +
      getExpense('schedule_c_line_13') +
      getExpense('schedule_c_line_15') +
      getExpense('schedule_c_line_16a') +
      getExpense('schedule_c_line_16b') +
      getExpense('schedule_c_line_17') +
      getExpense('schedule_c_line_18') +
      getExpense('schedule_c_line_20a') +
      getExpense('schedule_c_line_20b') +
      getExpense('schedule_c_line_21') +
      getExpense('schedule_c_line_22') +
      getExpense('schedule_c_line_23') +
      getExpense('schedule_c_line_24a') +
      mealsDeductible +
      getExpense('schedule_c_line_25') +
      getExpense('schedule_c_line_27a');

    const tentativeProfit = grossReceipts - totalExpenses;
    const homeOffice = 0;
    const netProfit = tentativeProfit - homeOffice;

    const payload = {
      line_1_gross_receipts_cents: grossReceipts,
      line_2_returns_allowances_cents: 0,
      line_3_subtotal_cents: grossReceipts,
      line_4_cogs_cents: 0,
      line_5_gross_profit_cents: grossReceipts,
      line_6_other_income_cents: 0,
      line_7_gross_income_cents: grossReceipts,
      line_8_advertising_cents: getExpense('schedule_c_line_8'),
      line_9_car_truck_cents: getExpense('schedule_c_line_9'),
      line_10_commissions_cents: getExpense('schedule_c_line_10'),
      line_11_contract_labor_cents: getExpense('schedule_c_line_11'),
      line_12_depletion_cents: 0,
      line_13_depreciation_cents: getExpense('schedule_c_line_13'),
      line_14_employee_benefit_cents: 0,
      line_15_insurance_cents: getExpense('schedule_c_line_15'),
      line_16a_mortgage_interest_cents: getExpense('schedule_c_line_16a'),
      line_16b_other_interest_cents: getExpense('schedule_c_line_16b'),
      line_17_legal_professional_cents: getExpense('schedule_c_line_17'),
      line_18_office_expense_cents: getExpense('schedule_c_line_18'),
      line_19_pension_plans_cents: 0,
      line_20a_rent_vehicles_cents: getExpense('schedule_c_line_20a'),
      line_20b_rent_other_cents: getExpense('schedule_c_line_20b'),
      line_21_repairs_cents: getExpense('schedule_c_line_21'),
      line_22_supplies_cents: getExpense('schedule_c_line_22'),
      line_23_taxes_licenses_cents: getExpense('schedule_c_line_23'),
      line_24a_travel_cents: getExpense('schedule_c_line_24a'),
      line_24b_meals_cents: mealsDeductible,
      line_25_utilities_cents: getExpense('schedule_c_line_25'),
      line_26_wages_cents: 0,
      line_27a_other_expenses_cents: getExpense('schedule_c_line_27a'),
      line_27_other_expenses_detail: detailsMap.get('schedule_c_line_27a') || [],
      line_28_total_expenses_cents: totalExpenses,
      line_29_tentative_profit_cents: tentativeProfit,
      line_30_home_office_cents: homeOffice,
      line_31_net_profit_loss_cents: netProfit,
      is_draft: true,
      computed_at: new Date().toISOString()
    };

    await this.scheduleCRepo.upsert(organizationId, taxYear, payload);

    return {
      organization_id: organizationId,
      tax_year: taxYear,
      generated_at: new Date().toISOString(),
      ...payload,
      line_details: Object.fromEntries(detailsMap)
    };
  }
}
