-- ============================================================================
-- PART 2: MONEY OUT - DATABASE SCHEMA
-- ============================================================================
-- NOTE: Shared tables (organizations, users, categories, ledger_entries)
-- are owned by Part 4.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- VENDORS
-- ----------------------------------------------------------------------------

CREATE TABLE vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(500),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country CHAR(2),
    default_category_id UUID REFERENCES categories(id),
    default_payment_method VARCHAR(50),
    tax_id VARCHAR(50),
    is_1099_vendor BOOLEAN NOT NULL DEFAULT FALSE,
    bank_merchant_names TEXT[] NOT NULL DEFAULT '{}',
    total_spent_cents BIGINT NOT NULL DEFAULT 0,
    expense_count INTEGER NOT NULL DEFAULT 0,
    last_expense_date DATE,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    merged_into_id UUID REFERENCES vendors(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vendors_organization ON vendors(organization_id);
CREATE INDEX idx_vendors_name ON vendors(organization_id, name);
CREATE INDEX idx_vendors_merchant_names ON vendors USING GIN (bank_merchant_names);

CREATE TABLE vendor_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    alias VARCHAR(255) NOT NULL,
    source VARCHAR(20) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT vendor_aliases_unique UNIQUE (vendor_id, alias)
);

CREATE INDEX idx_vendor_aliases_vendor ON vendor_aliases(vendor_id);
CREATE INDEX idx_vendor_aliases_alias ON vendor_aliases(alias);

-- ----------------------------------------------------------------------------
-- EXPENSES
-- ----------------------------------------------------------------------------

CREATE TYPE expense_status AS ENUM (
    'pending', 'categorized', 'approved', 'rejected', 'reimbursed'
);

CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    description VARCHAR(500) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    date DATE NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id),
    vendor_id UUID REFERENCES vendors(id),
    vendor_name VARCHAR(255),
    payment_method VARCHAR(50),
    bank_transaction_id UUID,
    is_from_bank BOOLEAN NOT NULL DEFAULT FALSE,
    receipt_id UUID,
    has_receipt BOOLEAN NOT NULL DEFAULT FALSE,
    is_billable BOOLEAN NOT NULL DEFAULT FALSE,
    client_id UUID,
    is_billed BOOLEAN NOT NULL DEFAULT FALSE,
    invoice_id UUID,
    is_split BOOLEAN NOT NULL DEFAULT FALSE,
    parent_expense_id UUID REFERENCES expenses(id),
    status expense_status NOT NULL DEFAULT 'pending',
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    recurring_expense_id UUID,
    is_tax_deductible BOOLEAN NOT NULL DEFAULT TRUE,
    tax_category VARCHAR(100),
    original_amount_cents BIGINT,
    original_currency CHAR(3),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by_user_id UUID NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT expenses_amount_positive CHECK (amount_cents > 0),
    CONSTRAINT expenses_date_not_future CHECK (date <= CURRENT_DATE)
);

CREATE INDEX idx_expenses_organization ON expenses(organization_id);
CREATE INDEX idx_expenses_date ON expenses(organization_id, date);
CREATE INDEX idx_expenses_category ON expenses(organization_id, category_id);
CREATE INDEX idx_expenses_vendor ON expenses(vendor_id);
CREATE INDEX idx_expenses_status ON expenses(organization_id, status);
CREATE INDEX idx_expenses_billable ON expenses(organization_id, is_billable, is_billed) 
    WHERE is_billable = TRUE;
CREATE INDEX idx_expenses_deleted ON expenses(organization_id, deleted_at) 
    WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_expenses_bank_txn ON expenses(bank_transaction_id) 
    WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX idx_expenses_tags ON expenses USING GIN (tags);

CREATE TABLE expense_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id),
    amount_cents BIGINT NOT NULL,
    percentage NUMERIC(5, 2),
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT splits_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX idx_expense_splits_expense ON expense_splits(expense_id);

CREATE TABLE expense_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    expense_id UUID NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    receipt_id UUID,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    uploaded_by_user_id UUID NOT NULL
);

CREATE INDEX idx_expense_attachments_expense ON expense_attachments(expense_id);

-- ----------------------------------------------------------------------------
-- RECEIPTS
-- ----------------------------------------------------------------------------

CREATE TYPE receipt_status AS ENUM (
    'uploaded', 'processing', 'processed', 'failed', 'matched'
);

CREATE TABLE receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    thumbnail_url VARCHAR(500),
    status receipt_status NOT NULL DEFAULT 'uploaded',
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    ocr_raw_text TEXT,
    ocr_confidence NUMERIC(5, 2),
    extracted_data JSONB,
    expense_id UUID REFERENCES expenses(id),
    match_confidence NUMERIC(5, 2),
    match_suggestions JSONB,
    source VARCHAR(30) NOT NULL DEFAULT 'upload',
    source_email VARCHAR(255),
    file_hash VARCHAR(64) NOT NULL,
    is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_of_id UUID REFERENCES receipts(id),
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    uploaded_by_user_id UUID NOT NULL
);

CREATE INDEX idx_receipts_organization ON receipts(organization_id);
CREATE INDEX idx_receipts_status ON receipts(organization_id, status);
CREATE INDEX idx_receipts_expense ON receipts(expense_id) WHERE expense_id IS NOT NULL;
CREATE INDEX idx_receipts_file_hash ON receipts(organization_id, file_hash);
CREATE INDEX idx_receipts_unmatched ON receipts(organization_id, status) 
    WHERE expense_id IS NULL AND status = 'processed';

-- ----------------------------------------------------------------------------
-- BANK CONNECTIONS
-- ----------------------------------------------------------------------------

CREATE TYPE bank_connection_status AS ENUM (
    'connected', 'disconnected', 'error', 'pending', 'requires_reauth'
);

CREATE TABLE bank_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    plaid_item_id VARCHAR(255) NOT NULL,
    plaid_access_token TEXT NOT NULL,
    institution_id VARCHAR(100) NOT NULL,
    institution_name VARCHAR(255) NOT NULL,
    institution_logo_url VARCHAR(500),
    institution_color VARCHAR(20),
    status bank_connection_status NOT NULL DEFAULT 'pending',
    error_code VARCHAR(100),
    error_message TEXT,
    requires_reauth BOOLEAN NOT NULL DEFAULT FALSE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_status VARCHAR(20),
    last_cursor TEXT,
    connected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    connected_by_user_id UUID NOT NULL,
    CONSTRAINT bank_connections_plaid_unique UNIQUE (plaid_item_id)
);

CREATE INDEX idx_bank_connections_organization ON bank_connections(organization_id);
CREATE INDEX idx_bank_connections_status ON bank_connections(status);

CREATE TABLE bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    bank_connection_id UUID NOT NULL REFERENCES bank_connections(id) ON DELETE CASCADE,
    plaid_account_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    nickname VARCHAR(255),
    official_name VARCHAR(255),
    type VARCHAR(50) NOT NULL,
    subtype VARCHAR(50),
    mask VARCHAR(10),
    current_balance_cents BIGINT,
    available_balance_cents BIGINT,
    balance_currency CHAR(3),
    balance_updated_at TIMESTAMP WITH TIME ZONE,
    credit_limit_cents BIGINT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    default_category_id UUID REFERENCES categories(id),
    last_transaction_date DATE,
    transaction_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT bank_accounts_plaid_unique UNIQUE (plaid_account_id)
);

CREATE INDEX idx_bank_accounts_organization ON bank_accounts(organization_id);
CREATE INDEX idx_bank_accounts_connection ON bank_accounts(bank_connection_id);

-- ----------------------------------------------------------------------------
-- BANK TRANSACTIONS
-- ----------------------------------------------------------------------------

CREATE TYPE transaction_type AS ENUM ('debit', 'credit', 'transfer');

CREATE TABLE bank_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    bank_account_id UUID NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
    plaid_transaction_id VARCHAR(255) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    date DATE NOT NULL,
    authorized_date DATE,
    name VARCHAR(500) NOT NULL,
    merchant_name VARCHAR(255),
    original_description TEXT,
    transaction_type transaction_type NOT NULL,
    is_pending BOOLEAN NOT NULL DEFAULT FALSE,
    plaid_category TEXT[],
    plaid_category_id VARCHAR(50),
    category_id UUID REFERENCES categories(id),
    categorization_method VARCHAR(20),
    categorization_confidence NUMERIC(5, 2),
    is_categorized BOOLEAN NOT NULL DEFAULT FALSE,
    categorized_at TIMESTAMP WITH TIME ZONE,
    categorized_by_user_id UUID,
    vendor_id UUID REFERENCES vendors(id),
    is_business BOOLEAN NOT NULL DEFAULT TRUE,
    is_excluded BOOLEAN NOT NULL DEFAULT FALSE,
    is_duplicate BOOLEAN NOT NULL DEFAULT FALSE,
    duplicate_of_id UUID REFERENCES bank_transactions(id),
    expense_id UUID REFERENCES expenses(id),
    is_expense_created BOOLEAN NOT NULL DEFAULT FALSE,
    receipt_id UUID REFERENCES receipts(id),
    is_split BOOLEAN NOT NULL DEFAULT FALSE,
    notes TEXT,
    tags TEXT[] DEFAULT '{}',
    payment_channel VARCHAR(50),
    location JSONB,
    first_imported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_modified_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    plaid_last_modified TIMESTAMP WITH TIME ZONE,
    CONSTRAINT bank_txn_plaid_unique UNIQUE (plaid_transaction_id)
);

CREATE INDEX idx_bank_txn_organization ON bank_transactions(organization_id);
CREATE INDEX idx_bank_txn_account ON bank_transactions(bank_account_id);
CREATE INDEX idx_bank_txn_date ON bank_transactions(organization_id, date);
CREATE INDEX idx_bank_txn_uncategorized ON bank_transactions(organization_id, is_categorized) 
    WHERE is_categorized = FALSE;
CREATE INDEX idx_bank_txn_expense ON bank_transactions(expense_id) 
    WHERE expense_id IS NOT NULL;
CREATE INDEX idx_bank_txn_vendor ON bank_transactions(vendor_id);
CREATE INDEX idx_bank_txn_pending ON bank_transactions(organization_id, is_pending) 
    WHERE is_pending = TRUE;

CREATE TABLE transaction_splits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_id UUID NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
    category_id UUID NOT NULL REFERENCES categories(id),
    amount_cents BIGINT NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT txn_splits_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX idx_transaction_splits_transaction ON transaction_splits(transaction_id);

-- ----------------------------------------------------------------------------
-- CATEGORIZATION RULES
-- ----------------------------------------------------------------------------

CREATE TABLE categorization_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    conditions JSONB NOT NULL,
    category_id UUID NOT NULL REFERENCES categories(id),
    is_business BOOLEAN,
    vendor_id UUID REFERENCES vendors(id),
    tags TEXT[],
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    match_count INTEGER NOT NULL DEFAULT 0,
    last_matched_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cat_rules_organization ON categorization_rules(organization_id);
CREATE INDEX idx_cat_rules_priority ON categorization_rules(organization_id, priority DESC) 
    WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- RECURRING EXPENSES
-- ----------------------------------------------------------------------------

CREATE TYPE recurring_expense_status AS ENUM ('active', 'paused', 'completed', 'cancelled');

CREATE TABLE recurring_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    description VARCHAR(500) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    category_id UUID NOT NULL REFERENCES categories(id),
    vendor_id UUID REFERENCES vendors(id),
    payment_method VARCHAR(50),
    frequency VARCHAR(20) NOT NULL,
    frequency_interval INTEGER NOT NULL DEFAULT 1,
    custom_days INTEGER,
    start_date DATE NOT NULL,
    end_date DATE,
    next_occurrence_date DATE NOT NULL,
    billing_day INTEGER,
    billing_weekday INTEGER,
    status recurring_expense_status NOT NULL DEFAULT 'active',
    total_generated_count INTEGER NOT NULL DEFAULT 0,
    total_spent_cents BIGINT NOT NULL DEFAULT 0,
    last_generated_at TIMESTAMP WITH TIME ZONE,
    last_generated_expense_id UUID REFERENCES expenses(id),
    notify_before_days INTEGER,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by_user_id UUID NOT NULL,
    CONSTRAINT recurring_exp_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX idx_recurring_exp_organization ON recurring_expenses(organization_id);
CREATE INDEX idx_recurring_exp_next_date ON recurring_expenses(next_occurrence_date) 
    WHERE status = 'active';

-- ----------------------------------------------------------------------------
-- MILEAGE
-- ----------------------------------------------------------------------------

CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    make VARCHAR(100),
    model VARCHAR(100),
    year INTEGER,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_vehicles_organization ON vehicles(organization_id);

CREATE TABLE mileage_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    description VARCHAR(500) NOT NULL,
    start_location VARCHAR(255),
    end_location VARCHAR(255),
    distance_miles NUMERIC(10, 2) NOT NULL,
    purpose VARCHAR(20) NOT NULL DEFAULT 'business',
    trip_category VARCHAR(100),
    rate_type VARCHAR(20) NOT NULL DEFAULT 'standard',
    rate_per_mile_cents INTEGER NOT NULL,
    deduction_cents BIGINT NOT NULL,
    is_billable BOOLEAN NOT NULL DEFAULT FALSE,
    client_id UUID,
    invoice_id UUID,
    vehicle_id UUID REFERENCES vehicles(id),
    odometer_start INTEGER,
    odometer_end INTEGER,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT mileage_distance_positive CHECK (distance_miles > 0),
    CONSTRAINT mileage_date_not_future CHECK (date <= CURRENT_DATE)
);

CREATE INDEX idx_mileage_organization ON mileage_entries(organization_id);
CREATE INDEX idx_mileage_date ON mileage_entries(organization_id, date);
CREATE INDEX idx_mileage_billable ON mileage_entries(organization_id, is_billable) 
    WHERE is_billable = TRUE;

-- ----------------------------------------------------------------------------
-- LEDGER ENTRIES WRITE FUNCTION
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION create_expense_ledger_entry(
    p_organization_id UUID,
    p_expense_id UUID,
    p_date DATE,
    p_amount_cents BIGINT,
    p_currency CHAR(3),
    p_category_id UUID,
    p_description TEXT
) RETURNS UUID AS $$
DECLARE
    v_entry_id UUID;
BEGIN
    INSERT INTO ledger_entries (
        organization_id, date, type, amount_cents, currency,
        category_id, description, source_type, source_id
    ) VALUES (
        p_organization_id, p_date, 'expense', p_amount_cents, p_currency,
        p_category_id, p_description, 'expense', p_expense_id
    ) RETURNING id INTO v_entry_id;

    RETURN v_entry_id;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- TRIGGERS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_vendors_updated_at BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_connections_updated_at BEFORE UPDATE ON bank_connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bank_accounts_updated_at BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recurring_expenses_updated_at BEFORE UPDATE ON recurring_expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON vehicles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_mileage_updated_at BEFORE UPDATE ON mileage_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION update_vendor_stats()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.vendor_id IS NOT NULL THEN
            UPDATE vendors SET
                total_spent_cents = (
                    SELECT COALESCE(SUM(amount_cents), 0)
                    FROM expenses
                    WHERE vendor_id = NEW.vendor_id AND deleted_at IS NULL
                ),
                expense_count = (
                    SELECT COUNT(*)
                    FROM expenses
                    WHERE vendor_id = NEW.vendor_id AND deleted_at IS NULL
                ),
                last_expense_date = (
                    SELECT MAX(date)
                    FROM expenses
                    WHERE vendor_id = NEW.vendor_id AND deleted_at IS NULL
                ),
                updated_at = NOW()
            WHERE id = NEW.vendor_id;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        IF OLD.vendor_id IS NOT NULL AND (TG_OP = 'DELETE' OR OLD.vendor_id != NEW.vendor_id) THEN
            UPDATE vendors SET
                total_spent_cents = (
                    SELECT COALESCE(SUM(amount_cents), 0)
                    FROM expenses
                    WHERE vendor_id = OLD.vendor_id AND deleted_at IS NULL
                ),
                expense_count = (
                    SELECT COUNT(*)
                    FROM expenses
                    WHERE vendor_id = OLD.vendor_id AND deleted_at IS NULL
                ),
                last_expense_date = (
                    SELECT MAX(date)
                    FROM expenses
                    WHERE vendor_id = OLD.vendor_id AND deleted_at IS NULL
                ),
                updated_at = NOW()
            WHERE id = OLD.vendor_id;
        END IF;
    END IF;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_vendor_stats
    AFTER INSERT OR UPDATE OR DELETE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_vendor_stats();
