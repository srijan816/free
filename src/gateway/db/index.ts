import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { config } from '../config.js';

export interface Database {
  organizations: any;
  users: any;
  sessions: any;
  categories: any;
  clients: any;
  invoices: any;
  invoice_line_items: any;
  payments: any;
  payment_refunds: any;
  payment_receipts: any;
  expenses: any;
  receipts: any;
  vendors: any;
  bank_accounts: any;
  bank_transactions: any;
  bank_connections: any;
  insights: any;
  tax_estimates: any;
  ledger_entries: any;
  ledger_period_locks: any;
  workflow_jobs: any;
  invitations: any;
  api_keys: any;
  audit_logs: any;
  notifications: any;
  magic_links: any;
  webhooks: any;
  webhook_deliveries: any;
  billing_history: any;
  feature_flags: any;
  system_settings: any;
  escrow_transactions: any;
  escrow_disputes: any;
  escrow_accounts: any;
  escrow_milestones: any;
  invoice_activities: any;
}

const pool = new Pool({
  connectionString: config.databaseUrl
});

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({ pool })
});

export async function closeDb() {
  await pool.end();
}
