import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { config } from '../config.js';

export interface Database {
  organizations: any;
  users: any;
  categories: any;
  ledger_entries: any;
  vendors: any;
  vendor_aliases: any;
  expenses: any;
  expense_splits: any;
  expense_attachments: any;
  receipts: any;
  bank_connections: any;
  bank_accounts: any;
  bank_transactions: any;
  transaction_splits: any;
  categorization_rules: any;
  recurring_expenses: any;
  mileage_entries: any;
  vehicles: any;
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
