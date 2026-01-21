-- ============================================================================
-- PART 1: MONEY IN - DATABASE SCHEMA
-- ============================================================================
-- NOTE: Shared tables (organizations, users, categories) are owned by Part 4.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- CLIENTS
-- ----------------------------------------------------------------------------

CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    company VARCHAR(255),
    phone VARCHAR(50),
    website VARCHAR(500),
    address_line1 VARCHAR(255),
    address_line2 VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(100),
    postal_code VARCHAR(20),
    country CHAR(2),
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    tax_id VARCHAR(50),
    notes TEXT,
    tags TEXT[],
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT clients_email_unique UNIQUE (organization_id, email),
    CONSTRAINT clients_payment_terms_positive CHECK (payment_terms_days >= 0)
);

CREATE INDEX idx_clients_organization ON clients(organization_id);
CREATE INDEX idx_clients_email ON clients(organization_id, email);
CREATE INDEX idx_clients_name ON clients(organization_id, name);
CREATE INDEX idx_clients_is_active ON clients(organization_id, is_active);

CREATE TABLE client_contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    role VARCHAR(100),
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_client_contacts_client ON client_contacts(client_id);

-- ----------------------------------------------------------------------------
-- INVOICES
-- ----------------------------------------------------------------------------

CREATE TYPE invoice_status AS ENUM (
    'draft', 'sent', 'viewed', 'partial', 'paid', 'overdue', 'cancelled', 'refunded'
);

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    invoice_number VARCHAR(50) NOT NULL,
    reference VARCHAR(100),
    status invoice_status NOT NULL DEFAULT 'draft',
    issue_date DATE NOT NULL,
    due_date DATE NOT NULL,
    currency CHAR(3) NOT NULL,
    subtotal_cents BIGINT NOT NULL DEFAULT 0,
    discount_type VARCHAR(10),
    discount_value NUMERIC(10, 2),
    discount_cents BIGINT NOT NULL DEFAULT 0,
    tax_rate NUMERIC(5, 2),
    tax_cents BIGINT NOT NULL DEFAULT 0,
    total_cents BIGINT NOT NULL DEFAULT 0,
    amount_paid_cents BIGINT NOT NULL DEFAULT 0,
    amount_due_cents BIGINT NOT NULL DEFAULT 0,
    notes TEXT,
    terms TEXT,
    footer TEXT,
    template_id UUID,
    sent_at TIMESTAMP WITH TIME ZONE,
    sent_to_emails TEXT[],
    viewed_at TIMESTAMP WITH TIME ZONE,
    view_count INTEGER NOT NULL DEFAULT 0,
    paid_at TIMESTAMP WITH TIME ZONE,
    payment_link_token VARCHAR(64) NOT NULL UNIQUE,
    recurring_schedule_id UUID,
    escrow_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    reminders_paused BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    CONSTRAINT invoices_number_unique UNIQUE (organization_id, invoice_number),
    CONSTRAINT invoices_due_after_issue CHECK (due_date >= issue_date),
    CONSTRAINT invoices_amounts_positive CHECK (
        subtotal_cents >= 0 AND
        discount_cents >= 0 AND
        tax_cents >= 0 AND
        total_cents >= 0 AND
        amount_paid_cents >= 0 AND
        amount_due_cents >= 0
    )
);

CREATE INDEX idx_invoices_organization ON invoices(organization_id);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(organization_id, status);
CREATE INDEX idx_invoices_due_date ON invoices(organization_id, due_date);
CREATE INDEX idx_invoices_payment_token ON invoices(payment_link_token);
CREATE INDEX idx_invoices_created_at ON invoices(organization_id, created_at DESC);

CREATE TABLE invoice_line_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity NUMERIC(10, 4) NOT NULL DEFAULT 1,
    unit VARCHAR(50),
    unit_price_cents BIGINT NOT NULL,
    amount_cents BIGINT NOT NULL,
    tax_rate NUMERIC(5, 2),
    category_id UUID REFERENCES categories(id),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT line_items_quantity_positive CHECK (quantity > 0),
    CONSTRAINT line_items_amounts_positive CHECK (unit_price_cents >= 0 AND amount_cents >= 0)
);

CREATE INDEX idx_invoice_line_items_invoice ON invoice_line_items(invoice_id);

CREATE TABLE invoice_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    html_template TEXT NOT NULL,
    css_styles TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    preview_image_url VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_templates_organization ON invoice_templates(organization_id);

CREATE TABLE invoice_attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    file_name VARCHAR(255) NOT NULL,
    file_url VARCHAR(500) NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_attachments_invoice ON invoice_attachments(invoice_id);

CREATE TABLE invoice_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    description TEXT NOT NULL,
    performed_by_user_id UUID,
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoice_activities_invoice ON invoice_activities(invoice_id);
CREATE INDEX idx_invoice_activities_created_at ON invoice_activities(invoice_id, created_at DESC);

CREATE TABLE invoice_number_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    pattern VARCHAR(100) NOT NULL DEFAULT 'INV-{NUMBER:4}',
    next_number INTEGER NOT NULL DEFAULT 1,
    reset_frequency VARCHAR(20) NOT NULL DEFAULT 'never',
    last_reset_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- PAYMENTS
-- ----------------------------------------------------------------------------

CREATE TYPE payment_status AS ENUM (
    'pending', 'processing', 'completed', 'failed', 'refunded', 'partially_refunded'
);

CREATE TABLE payment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    provider VARCHAR(20) NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    stripe_charges_enabled BOOLEAN,
    stripe_payouts_enabled BOOLEAN,
    stripe_details_submitted BOOLEAN,
    default_for_currencies CHAR(3)[],
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT payment_accounts_provider_unique UNIQUE (organization_id, provider)
);

CREATE INDEX idx_payment_accounts_organization ON payment_accounts(organization_id);

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    amount_cents BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    fee_cents BIGINT,
    net_amount_cents BIGINT,
    payment_method VARCHAR(50) NOT NULL,
    status payment_status NOT NULL DEFAULT 'pending',
    provider VARCHAR(20),
    provider_payment_id VARCHAR(255),
    provider_charge_id VARCHAR(255),
    manual_method VARCHAR(50),
    manual_reference VARCHAR(255),
    manual_notes TEXT,
    refunded_amount_cents BIGINT NOT NULL DEFAULT 0,
    refunded_at TIMESTAMP WITH TIME ZONE,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_by_user_id UUID,
    CONSTRAINT payments_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX idx_payments_organization ON payments(organization_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_status ON payments(organization_id, status);
CREATE INDEX idx_payments_paid_at ON payments(organization_id, paid_at DESC);
CREATE INDEX idx_payments_provider ON payments(provider, provider_payment_id);

CREATE TABLE payment_refunds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    amount_cents BIGINT NOT NULL,
    reason TEXT,
    provider_refund_id VARCHAR(255),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by_user_id UUID NOT NULL,
    CONSTRAINT refunds_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX idx_payment_refunds_payment ON payment_refunds(payment_id);

CREATE TABLE payment_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID NOT NULL REFERENCES payments(id) ON DELETE RESTRICT,
    receipt_number VARCHAR(100) NOT NULL,
    pdf_url VARCHAR(500),
    sent_to_email VARCHAR(255),
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payment_receipts_payment ON payment_receipts(payment_id);

-- ----------------------------------------------------------------------------
-- RECURRING INVOICES
-- ----------------------------------------------------------------------------

CREATE TYPE recurring_status AS ENUM ('active', 'paused', 'completed', 'cancelled');

CREATE TABLE recurring_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    frequency VARCHAR(20) NOT NULL,
    frequency_interval INTEGER NOT NULL DEFAULT 1,
    custom_days INTEGER,
    start_date DATE NOT NULL,
    end_date DATE,
    next_issue_date DATE NOT NULL,
    template JSONB NOT NULL,
    auto_send BOOLEAN NOT NULL DEFAULT FALSE,
    send_days_before_due INTEGER NOT NULL DEFAULT 0,
    status recurring_status NOT NULL DEFAULT 'active',
    invoices_generated_count INTEGER NOT NULL DEFAULT 0,
    last_generated_at TIMESTAMP WITH TIME ZONE,
    last_generated_invoice_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_recurring_schedules_organization ON recurring_schedules(organization_id);
CREATE INDEX idx_recurring_schedules_client ON recurring_schedules(client_id);
CREATE INDEX idx_recurring_schedules_next_date ON recurring_schedules(next_issue_date) WHERE status = 'active';

CREATE TABLE recurring_skips (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recurring_schedule_id UUID NOT NULL REFERENCES recurring_schedules(id) ON DELETE CASCADE,
    skip_date DATE NOT NULL,
    reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT recurring_skips_unique UNIQUE (recurring_schedule_id, skip_date)
);

-- ----------------------------------------------------------------------------
-- REMINDERS
-- ----------------------------------------------------------------------------

CREATE TABLE reminder_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    reminders JSONB NOT NULL DEFAULT '[]',
    max_reminders_per_invoice INTEGER NOT NULL DEFAULT 5,
    stop_reminders_after_days INTEGER NOT NULL DEFAULT 60,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE reminder_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    type VARCHAR(20) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reminder_templates_organization ON reminder_templates(organization_id);

CREATE TABLE reminder_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL,
    reminder_type VARCHAR(20),
    sent_to_email VARCHAR(255) NOT NULL,
    subject VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'sent',
    sent_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMP WITH TIME ZONE,
    opened_at TIMESTAMP WITH TIME ZONE,
    clicked_at TIMESTAMP WITH TIME ZONE,
    error_message TEXT,
    sent_by_user_id UUID
);

CREATE INDEX idx_reminder_logs_invoice ON reminder_logs(invoice_id);
CREATE INDEX idx_reminder_logs_sent_at ON reminder_logs(invoice_id, sent_at DESC);

-- ----------------------------------------------------------------------------
-- ESCROW
-- ----------------------------------------------------------------------------

CREATE TYPE escrow_transaction_status AS ENUM (
    'pending_funding', 'funded', 'release_requested', 'released', 'disputed', 'refunded', 'cancelled'
);

CREATE TABLE escrow_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
    stripe_connected_account_id VARCHAR(255) NOT NULL,
    total_held_cents BIGINT NOT NULL DEFAULT 0,
    total_released_cents BIGINT NOT NULL DEFAULT 0,
    total_disputed_cents BIGINT NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL DEFAULT 'USD',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE escrow_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_account_id UUID NOT NULL REFERENCES escrow_accounts(id) ON DELETE RESTRICT,
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE RESTRICT,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
    type VARCHAR(20) NOT NULL,
    amount_cents BIGINT NOT NULL,
    fee_cents BIGINT NOT NULL DEFAULT 0,
    currency CHAR(3) NOT NULL,
    status escrow_transaction_status NOT NULL DEFAULT 'pending_funding',
    milestone_id UUID,
    milestone_description TEXT,
    release_requested_at TIMESTAMP WITH TIME ZONE,
    release_approved_at TIMESTAMP WITH TIME ZONE,
    auto_release_date DATE,
    stripe_payment_intent_id VARCHAR(255),
    stripe_transfer_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT escrow_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX idx_escrow_transactions_account ON escrow_transactions(escrow_account_id);
CREATE INDEX idx_escrow_transactions_invoice ON escrow_transactions(invoice_id);
CREATE INDEX idx_escrow_transactions_status ON escrow_transactions(status);
CREATE INDEX idx_escrow_transactions_auto_release ON escrow_transactions(auto_release_date)
    WHERE status = 'release_requested';

CREATE TABLE escrow_milestones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    amount_cents BIGINT NOT NULL,
    percentage NUMERIC(5, 2),
    sort_order INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    released_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT milestone_amount_positive CHECK (amount_cents > 0)
);

CREATE INDEX idx_escrow_milestones_invoice ON escrow_milestones(invoice_id);

CREATE TABLE escrow_disputes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    escrow_transaction_id UUID NOT NULL REFERENCES escrow_transactions(id) ON DELETE RESTRICT,
    initiated_by VARCHAR(20) NOT NULL,
    initiated_by_user_id UUID NOT NULL,
    reason TEXT NOT NULL,
    supporting_documents JSONB,
    status VARCHAR(30) NOT NULL DEFAULT 'open',
    resolution_type VARCHAR(30),
    resolution_notes TEXT,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by_user_id UUID,
    freelancer_amount_cents BIGINT,
    client_refund_cents BIGINT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escrow_disputes_transaction ON escrow_disputes(escrow_transaction_id);
CREATE INDEX idx_escrow_disputes_status ON escrow_disputes(status) WHERE status = 'open';

CREATE TABLE escrow_dispute_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id UUID NOT NULL REFERENCES escrow_disputes(id) ON DELETE CASCADE,
    sender_type VARCHAR(20) NOT NULL,
    sender_user_id UUID,
    message TEXT NOT NULL,
    attachments JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_escrow_dispute_messages_dispute ON escrow_dispute_messages(dispute_id);

-- ----------------------------------------------------------------------------
-- CLIENT PORTAL
-- ----------------------------------------------------------------------------

CREATE TABLE client_portal_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    access_type VARCHAR(20) NOT NULL DEFAULT 'magic_link',
    access_token VARCHAR(255),
    token_expires_at TIMESTAMP WITH TIME ZONE,
    password_hash VARCHAR(255),
    last_accessed_at TIMESTAMP WITH TIME ZONE,
    access_count INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT portal_access_token_unique UNIQUE (access_token)
);

CREATE INDEX idx_client_portal_access_client ON client_portal_access(client_id);
CREATE INDEX idx_client_portal_access_token ON client_portal_access(access_token) WHERE is_active = TRUE;

-- ----------------------------------------------------------------------------
-- LEDGER ENTRIES
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    type VARCHAR(20) NOT NULL,
    amount_cents BIGINT NOT NULL,
    currency CHAR(3) NOT NULL,
    category_id UUID REFERENCES categories(id),
    description TEXT,
    source_type VARCHAR(50) NOT NULL,
    source_id UUID NOT NULL,
    reconciled BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ledger_entries_organization ON ledger_entries(organization_id);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_date ON ledger_entries(organization_id, date);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_type ON ledger_entries(organization_id, type);
CREATE INDEX IF NOT EXISTS idx_ledger_entries_source ON ledger_entries(source_type, source_id);

-- ----------------------------------------------------------------------------
-- FUNCTIONS & TRIGGERS
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION generate_payment_token()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.payment_link_token IS NULL THEN
        NEW.payment_link_token = encode(gen_random_bytes(32), 'hex');
    END IF;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER generate_invoice_payment_token BEFORE INSERT ON invoices
    FOR EACH ROW EXECUTE FUNCTION generate_payment_token();
