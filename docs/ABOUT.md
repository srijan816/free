# What This SaaS Is

This project is a unified, four-service SaaS suite built for freelancers and small teams who need a single system to run their business finances. It combines billing (Money In), spending (Money Out), analytics and tax insights (Intelligence), and a central control plane (Gateway/Auth/Ledger). The result is a full financial operating system: create invoices, collect payments, track expenses, reconcile bank activity, and get actionable tax and cash-flow insights.

# Core Use Case

The primary use case is a service business that wants to:
- Get paid faster with professional invoices, payment links, and reminders.
- Track expenses, receipts, and bank transactions without using multiple tools.
- See real-time profitability, cash runway, and tax estimates.
- Keep the financial ledger consistent across revenue and expenses.

# Who This Helps

This SaaS is designed to help:
- Freelancers who handle their own invoicing, expenses, and taxes.
- Independent contractors who need simple, accurate cash-flow visibility.
- Small agencies or consultancies with multiple clients and recurring work.
- Finance-lean teams that want one system instead of spreadsheets + scattered apps.

# What It Does

## Money In (Revenue)
- Manage clients, invoices, and payment links.
- Accept payments (Stripe integration is stubbed for local use).
- Handle escrow workflows for milestone-based work.
- Generate invoice PDFs and send reminders.
- Run scheduled jobs for recurring invoices and overdue updates.

## Money Out (Expenses)
- Track vendors, expenses, receipts, mileage, and vehicles.
- Connect bank accounts (Plaid integration is stubbed for local use).
- Sync transactions and categorize them (AI categorization is stubbed).
- Parse receipts via OCR (stubbed, with a hybrid routing strategy).
- Run scheduled jobs for recurring expenses and vendor statistics.

## Intelligence (Analytics + Tax)
- Build dashboards for income, expenses, and net profit.
- Generate financial reports and exports.
- Estimate quarterly taxes and compute true liquid balance.
- Provide forecasts and anomaly insights.

## Gateway / Auth / Ledger (Control Plane)
- Issues JWTs, enforces permissions, and rate limits.
- Proxies API calls to the correct service.
- Writes the canonical ledger based on Money In/Out events.
- Runs workflow scheduling for bank syncs, escrow auto-release, and tax recaps.
- Hosts a minimal "Control Room" home page for service health.

# How It Works (High Level)

1. A user authenticates with the Gateway and receives a JWT.
2. Client requests go through the Gateway, which validates and forwards them.
3. Money In and Money Out perform domain actions (invoices, expenses, etc).
4. Domain services publish events through Redis pub/sub.
5. Gateway consumes those events and updates `ledger_entries`.
6. Intelligence queries the ledger to compute dashboards, reports, and tax insights.

# Why This Architecture Matters

- It keeps the ledger consistent across revenue and expenses.
- It allows each service to scale independently while sharing a data model.
- It supports event-driven workflows and scheduled jobs.
- It provides a single entry point for auth, rate limiting, and API routing.

# Summary

This SaaS is a unified financial suite for freelancers and small teams. It replaces multiple disconnected tools with a single system that handles invoicing, payments, expenses, banking, reporting, and tax insights. The Gateway controls access and ensures a clean, auditable ledger, while the Intelligence service turns raw transactions into actionable financial guidance.
