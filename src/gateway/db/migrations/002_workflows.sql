DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'workflow_job_status') THEN
        CREATE TYPE workflow_job_status AS ENUM ('queued', 'running', 'completed', 'failed', 'cancelled');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS workflow_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_type VARCHAR(100) NOT NULL,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    run_at TIMESTAMPTZ NOT NULL,
    status workflow_job_status NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    payload JSONB NOT NULL DEFAULT '{}',
    dedupe_key VARCHAR(255),
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_jobs_due ON workflow_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_workflow_jobs_org ON workflow_jobs(organization_id, workflow_type);
CREATE UNIQUE INDEX IF NOT EXISTS uq_workflow_jobs_dedupe_active
    ON workflow_jobs(dedupe_key)
    WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS ledger_period_locks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'locked',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_ledger_period_org UNIQUE (organization_id, period_start, period_end)
);

CREATE INDEX IF NOT EXISTS idx_ledger_period_org ON ledger_period_locks(organization_id, period_start);
