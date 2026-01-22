# Architecture Overview

This repository is a unified TypeScript codebase that runs a four-service SaaS suite
for freelancers or small teams. The services are deployed as separate Node processes
but share a common data model and a Redis-based event bus.

## Services

### Gateway / Auth / Ledger (Part 4)
- Fastify API that owns authentication, user/org management, and shared metadata.
- Issues JWTs, validates access, and enforces per-plan rate limits.
- Proxies `/api/v1/*` to the Money In/Out/Intelligence services.
- Consumes events to write canonical `ledger_entries` (the source for analytics).
- Runs a workflow scheduler for escrow auto-release, bank sync, and quarterly tax recap.
- Provides unified dashboard + search endpoints and a minimal Control Room UI.

### Money In (Part 1)
- Fastify API for revenue: clients, invoices, payments, escrow, reminders, portal, payment links.
- Generates invoice PDFs and sends emails (stubbed SendGrid integration).
- Stripe integration is stubbed for local use; publishes payment/escrow events.
- Cron jobs handle recurring schedules, automated reminders, and overdue updates.

### Money Out (Part 2)
- Fastify API for expenses: vendors, receipts, bank connections, transactions, mileage, vehicles.
- OCR + AI helpers (stubbed) for receipt parsing and categorization.
- Plaid integration is stubbed; bank sync happens via workflow events.
- Cron jobs handle recurring expenses, vendor stats, and cleanup.

### Intelligence (Part 3)
- Express API for dashboards, reports, taxes, forecasts, insights, exports, budgets.
- Reads from the shared Postgres tables and calls internal Part 1/Part 2 endpoints.
- Publishes `insight.created` events that the Gateway turns into notifications.

## Data Model and Storage
- Postgres is the primary datastore (TimescaleDB used for time-series on ledger data).
- Shared tables: `organizations`, `users`, `categories`, `ledger_entries`, `notifications`,
  `workflow_jobs`, `billing_history`, plus auth/session tables.
- Money In/Out add domain tables for invoices, payments, expenses, vendors, receipts, etc.
- Intelligence reads ledger + domain tables to compute analytics and reports.
- Files are stored on disk under `storage/` by default; optional S3 config exists.

## Event Bus and Workflows
- Redis pub/sub is used for cross-service events (payment, expense, bank, insight, etc).
- Gateway listens to payment + expense events and upserts `ledger_entries`.
- Workflow scheduler polls `workflow_jobs` and emits events for:
  - `escrow.auto_release`
  - `bank.sync`
  - quarterly `tax.recap_*` events based on reconciliation status

## Request Flow (Example)
1. Client authenticates against Gateway and receives JWTs.
2. Client calls `GET /api/v1/invoices` on Gateway with the access token.
3. Gateway validates the token, rate limits, and proxies the request to Money In.
4. Money In writes invoice/payment data and publishes `payment.completed`.
5. Gateway consumes the event and writes a `ledger_entries` row.
6. Intelligence dashboards read `ledger_entries` for income/expense metrics.

## Security and Guardrails
- JWTs are issued by the Gateway; other services accept forwarded headers or validate JWTs.
- Internal calls to magic link endpoints use `x-internal-key`.
- Currency fields are enforced as integer cents at the gateway layer.

## Local Ports
- Money In: `22001`
- Money Out: `22002`
- Intelligence: `22003`
- Gateway: `22004`
