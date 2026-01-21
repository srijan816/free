import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { config } from '../config.js';

export interface Database {
  organizations: any;
  users: any;
  categories: any;
  clients: any;
  client_contacts: any;
  invoices: any;
  invoice_line_items: any;
  invoice_templates: any;
  invoice_attachments: any;
  invoice_activities: any;
  invoice_number_settings: any;
  payment_accounts: any;
  payments: any;
  payment_refunds: any;
  payment_receipts: any;
  recurring_schedules: any;
  recurring_skips: any;
  reminder_settings: any;
  reminder_templates: any;
  reminder_logs: any;
  escrow_accounts: any;
  escrow_transactions: any;
  escrow_milestones: any;
  escrow_disputes: any;
  escrow_dispute_messages: any;
  client_portal_access: any;
  ledger_entries: any;
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
