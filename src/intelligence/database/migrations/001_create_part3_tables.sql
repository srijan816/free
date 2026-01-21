-- Part 3 core tables (subset of full PRD schema)

-- Types
CREATE TYPE report_type AS ENUM (
  'profit_and_loss',
  'cash_flow',
  'balance_sheet',
  'tax_summary',
  'expense_by_category',
  'income_by_client',
  'quarterly_summary',
  'annual_summary',
  'schedule_c',
  'contractor_payments',
  'custom'
);

CREATE TYPE report_status AS ENUM ('queued', 'generating', 'completed', 'failed');
CREATE TYPE report_format AS ENUM ('json', 'pdf', 'csv', 'xlsx', 'qbo', 'xero');

CREATE TYPE filing_status AS ENUM (
  'single',
  'married_filing_jointly',
  'married_filing_separately',
  'head_of_household',
  'qualifying_widow'
);

CREATE TYPE insight_type AS ENUM (
  'anomaly',
  'trend',
  'opportunity',
  'warning',
  'milestone',
  'tax_tip',
  'cash_flow_alert',
  'expense_spike',
  'revenue_decline',
  'client_concentration',
  'payment_pattern',
  'seasonal_pattern'
);

CREATE TYPE insight_severity AS ENUM ('info', 'success', 'warning', 'critical');

CREATE TYPE export_type AS ENUM (
  'transactions',
  'invoices',
  'expenses',
  'report',
  'tax_data',
  'full_backup'
);

CREATE TYPE export_format AS ENUM (
  'csv',
  'xlsx',
  'pdf',
  'json',
  'qbo',
  'xero',
  'txf'
);

CREATE TYPE export_status AS ENUM ('queued', 'processing', 'completed', 'failed', 'expired');

CREATE TYPE budget_period AS ENUM ('monthly', 'quarterly', 'annually');

CREATE TYPE forecast_horizon AS ENUM (
  '7_days',
  '30_days',
  '60_days',
  '90_days',
  '6_months',
  '12_months'
);

CREATE TYPE schedule_frequency AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'annually');

-- Metrics tables
CREATE TABLE IF NOT EXISTS daily_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  metric_date DATE NOT NULL,
  total_invoiced_cents BIGINT DEFAULT 0,
  total_collected_cents BIGINT DEFAULT 0,
  invoices_sent_count INTEGER DEFAULT 0,
  invoices_paid_count INTEGER DEFAULT 0,
  new_clients_count INTEGER DEFAULT 0,
  total_expenses_cents BIGINT DEFAULT 0,
  expenses_count INTEGER DEFAULT 0,
  total_mileage_deduction_cents BIGINT DEFAULT 0,
  net_income_cents BIGINT GENERATED ALWAYS AS (total_collected_cents - total_expenses_cents) STORED,
  cash_balance_cents BIGINT DEFAULT 0,
  outstanding_receivables_cents BIGINT DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_daily_metrics_org_date UNIQUE (organization_id, metric_date, currency)
);

CREATE TABLE IF NOT EXISTS monthly_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  metric_year INTEGER NOT NULL,
  metric_month INTEGER NOT NULL CHECK (metric_month BETWEEN 1 AND 12),
  total_invoiced_cents BIGINT DEFAULT 0,
  total_collected_cents BIGINT DEFAULT 0,
  invoices_sent_count INTEGER DEFAULT 0,
  invoices_paid_count INTEGER DEFAULT 0,
  invoices_overdue_count INTEGER DEFAULT 0,
  new_clients_count INTEGER DEFAULT 0,
  active_clients_count INTEGER DEFAULT 0,
  total_expenses_cents BIGINT DEFAULT 0,
  total_deductible_expenses_cents BIGINT DEFAULT 0,
  expenses_count INTEGER DEFAULT 0,
  total_mileage_cents BIGINT DEFAULT 0,
  net_income_cents BIGINT GENERATED ALWAYS AS (total_collected_cents - total_expenses_cents) STORED,
  gross_margin_percent NUMERIC(5, 2),
  average_invoice_cents BIGINT,
  average_days_to_payment NUMERIC(5, 2),
  income_change_percent NUMERIC(5, 2),
  expense_change_percent NUMERIC(5, 2),
  ending_cash_balance_cents BIGINT DEFAULT 0,
  ending_receivables_cents BIGINT DEFAULT 0,
  estimated_tax_liability_cents BIGINT DEFAULT 0,
  currency VARCHAR(3) DEFAULT 'USD',
  is_complete BOOLEAN DEFAULT FALSE,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_monthly_metrics_org_month UNIQUE (organization_id, metric_year, metric_month, currency)
);

-- Reports
CREATE TABLE IF NOT EXISTS generated_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  report_type report_type NOT NULL,
  report_name VARCHAR(255) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  comparison_period_start DATE,
  comparison_period_end DATE,
  parameters JSONB DEFAULT '{}',
  status report_status DEFAULT 'queued',
  format report_format DEFAULT 'json',
  report_data JSONB,
  file_url TEXT,
  file_size_bytes INTEGER,
  generated_by_user_id UUID,
  generation_started_at TIMESTAMPTZ,
  generation_completed_at TIMESTAMPTZ,
  generation_time_ms INTEGER,
  error_message TEXT,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '30 days',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tax settings
CREATE TABLE IF NOT EXISTS tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  tax_year INTEGER NOT NULL,
  filing_status filing_status DEFAULT 'single',
  state_code VARCHAR(2),
  other_income_cents BIGINT DEFAULT 0,
  spouse_income_cents BIGINT DEFAULT 0,
  use_standard_deduction BOOLEAN DEFAULT TRUE,
  itemized_deductions_cents BIGINT DEFAULT 0,
  home_office_enabled BOOLEAN DEFAULT FALSE,
  home_office_square_feet INTEGER,
  home_total_square_feet INTEGER,
  home_office_method VARCHAR(20) DEFAULT 'simplified',
  self_employed_health_insurance_cents BIGINT DEFAULT 0,
  sep_ira_contribution_cents BIGINT DEFAULT 0,
  solo_401k_contribution_cents BIGINT DEFAULT 0,
  q1_payment_cents BIGINT DEFAULT 0,
  q1_payment_date DATE,
  q2_payment_cents BIGINT DEFAULT 0,
  q2_payment_date DATE,
  q3_payment_cents BIGINT DEFAULT 0,
  q3_payment_date DATE,
  q4_payment_cents BIGINT DEFAULT 0,
  q4_payment_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_tax_settings_org_year UNIQUE (organization_id, tax_year)
);

CREATE TABLE IF NOT EXISTS tax_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  tax_year INTEGER NOT NULL,
  as_of_date DATE NOT NULL,
  gross_income_cents BIGINT DEFAULT 0,
  total_deductions_cents BIGINT DEFAULT 0,
  net_profit_cents BIGINT DEFAULT 0,
  se_tax_base_cents BIGINT DEFAULT 0,
  self_employment_tax_cents BIGINT DEFAULT 0,
  se_tax_deduction_cents BIGINT DEFAULT 0,
  adjusted_gross_income_cents BIGINT DEFAULT 0,
  standard_deduction_cents BIGINT DEFAULT 0,
  itemized_deduction_cents BIGINT DEFAULT 0,
  deduction_used_cents BIGINT DEFAULT 0,
  qbi_deduction_cents BIGINT DEFAULT 0,
  taxable_income_cents BIGINT DEFAULT 0,
  federal_income_tax_cents BIGINT DEFAULT 0,
  state_income_tax_cents BIGINT DEFAULT 0,
  total_tax_liability_cents BIGINT DEFAULT 0,
  total_quarterly_payments_cents BIGINT DEFAULT 0,
  remaining_tax_owed_cents BIGINT DEFAULT 0,
  next_quarterly_due_date DATE,
  next_quarterly_amount_cents BIGINT DEFAULT 0,
  recommended_monthly_savings_cents BIGINT DEFAULT 0,
  recommended_tax_reserve_percent NUMERIC(5, 2),
  confidence_level VARCHAR(20) DEFAULT 'estimated',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_tax_estimates UNIQUE (organization_id, tax_year, as_of_date)
);

CREATE TABLE IF NOT EXISTS schedule_c_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  tax_year INTEGER NOT NULL,
  line_1_gross_receipts_cents BIGINT DEFAULT 0,
  line_2_returns_allowances_cents BIGINT DEFAULT 0,
  line_3_subtotal_cents BIGINT DEFAULT 0,
  line_4_cogs_cents BIGINT DEFAULT 0,
  line_5_gross_profit_cents BIGINT DEFAULT 0,
  line_6_other_income_cents BIGINT DEFAULT 0,
  line_7_gross_income_cents BIGINT DEFAULT 0,
  line_8_advertising_cents BIGINT DEFAULT 0,
  line_9_car_truck_cents BIGINT DEFAULT 0,
  line_10_commissions_cents BIGINT DEFAULT 0,
  line_11_contract_labor_cents BIGINT DEFAULT 0,
  line_12_depletion_cents BIGINT DEFAULT 0,
  line_13_depreciation_cents BIGINT DEFAULT 0,
  line_14_employee_benefit_cents BIGINT DEFAULT 0,
  line_15_insurance_cents BIGINT DEFAULT 0,
  line_16a_mortgage_interest_cents BIGINT DEFAULT 0,
  line_16b_other_interest_cents BIGINT DEFAULT 0,
  line_17_legal_professional_cents BIGINT DEFAULT 0,
  line_18_office_expense_cents BIGINT DEFAULT 0,
  line_19_pension_plans_cents BIGINT DEFAULT 0,
  line_20a_rent_vehicles_cents BIGINT DEFAULT 0,
  line_20b_rent_other_cents BIGINT DEFAULT 0,
  line_21_repairs_cents BIGINT DEFAULT 0,
  line_22_supplies_cents BIGINT DEFAULT 0,
  line_23_taxes_licenses_cents BIGINT DEFAULT 0,
  line_24a_travel_cents BIGINT DEFAULT 0,
  line_24b_meals_cents BIGINT DEFAULT 0,
  line_25_utilities_cents BIGINT DEFAULT 0,
  line_26_wages_cents BIGINT DEFAULT 0,
  line_27a_other_expenses_cents BIGINT DEFAULT 0,
  line_27_other_expenses_detail JSONB DEFAULT '[]',
  line_28_total_expenses_cents BIGINT DEFAULT 0,
  line_29_tentative_profit_cents BIGINT DEFAULT 0,
  line_30_home_office_cents BIGINT DEFAULT 0,
  line_31_net_profit_loss_cents BIGINT DEFAULT 0,
  is_draft BOOLEAN DEFAULT TRUE,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_schedule_c_org_year UNIQUE (organization_id, tax_year)
);

-- Insights
CREATE TABLE IF NOT EXISTS insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  insight_type insight_type NOT NULL,
  severity insight_severity DEFAULT 'info',
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  data_points JSONB DEFAULT '{}',
  action_url TEXT,
  action_label VARCHAR(100),
  priority_score INTEGER DEFAULT 50,
  is_read BOOLEAN DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  is_dismissed BOOLEAN DEFAULT FALSE,
  dismissed_at TIMESTAMPTZ,
  insight_hash VARCHAR(64),
  valid_from TIMESTAMPTZ DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Forecasts
CREATE TABLE IF NOT EXISTS cash_flow_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  horizon forecast_horizon NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  starting_cash_cents BIGINT NOT NULL,
  expected_collections_cents BIGINT DEFAULT 0,
  recurring_income_cents BIGINT DEFAULT 0,
  other_expected_income_cents BIGINT DEFAULT 0,
  total_expected_inflows_cents BIGINT DEFAULT 0,
  recurring_expenses_cents BIGINT DEFAULT 0,
  expected_tax_payments_cents BIGINT DEFAULT 0,
  other_expected_expenses_cents BIGINT DEFAULT 0,
  total_expected_outflows_cents BIGINT DEFAULT 0,
  net_cash_flow_cents BIGINT DEFAULT 0,
  ending_cash_cents BIGINT DEFAULT 0,
  daily_forecast JSONB DEFAULT '[]',
  days_until_negative INTEGER,
  lowest_balance_cents BIGINT,
  lowest_balance_date DATE,
  confidence_score NUMERIC(3, 2),
  assumptions JSONB DEFAULT '{}',
  currency VARCHAR(3) DEFAULT 'USD',
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '24 hours',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Budgets
CREATE TABLE IF NOT EXISTS budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  budget_year INTEGER NOT NULL,
  period_type budget_period DEFAULT 'monthly',
  total_budget_cents BIGINT NOT NULL CHECK (total_budget_cents > 0),
  alert_at_percent INTEGER DEFAULT 80,
  critical_at_percent INTEGER DEFAULT 100,
  is_active BOOLEAN DEFAULT TRUE,
  currency VARCHAR(3) DEFAULT 'USD',
  created_by_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id UUID NOT NULL REFERENCES budgets(id) ON DELETE CASCADE,
  category_id UUID NOT NULL,
  budgeted_cents BIGINT NOT NULL CHECK (budgeted_cents >= 0),
  period_amounts JSONB DEFAULT '{}',
  custom_alert_percent INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_budget_category UNIQUE (budget_id, category_id)
);

-- Exchange rates
CREATE TABLE IF NOT EXISTS exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency VARCHAR(3) NOT NULL,
  target_currency VARCHAR(3) NOT NULL,
  rate_date DATE NOT NULL,
  rate NUMERIC(20, 10) NOT NULL,
  rate_source VARCHAR(100) DEFAULT 'openexchangerates',
  fetched_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_exchange_rate UNIQUE (base_currency, target_currency, rate_date)
);

-- Data exports
CREATE TABLE IF NOT EXISTS data_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  export_type export_type NOT NULL,
  format export_format NOT NULL,
  date_range_start DATE,
  date_range_end DATE,
  filters JSONB DEFAULT '{}',
  status export_status DEFAULT 'queued',
  file_url TEXT,
  file_name VARCHAR(255),
  file_size_bytes BIGINT,
  row_count INTEGER,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  processing_time_ms INTEGER,
  error_message TEXT,
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,
  requested_by_user_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
