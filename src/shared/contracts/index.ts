// Shared contracts for Part 3 integration.

export interface Organization {
  id: string;
  name: string;
  email: string;
  currency: string;
  timezone: string;
  fiscal_year_start: number;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  organization_id: string;
  email: string;
  name: string;
  role: 'owner' | 'admin' | 'member';
  created_at: Date;
}

export interface Category {
  id: string;
  organization_id: string;
  name: string;
  type: 'income' | 'expense';
  tax_category?: string;
  parent_id?: string;
  color?: string;
  is_default: boolean;
  created_at: Date;
}

export interface LedgerEntry {
  id: string;
  organization_id: string;
  date: Date;
  type: 'income' | 'expense' | 'transfer';
  amount_cents: number;
  currency: string;
  category_id?: string;
  description?: string;
  source_type: 'invoice' | 'payment' | 'expense' | 'bank_transaction';
  source_id: string;
  reconciled: boolean;
  created_at: Date;
}

export interface BaseEvent {
  event_id: string;
  organization_id: string;
  timestamp: string;
  source: 'part1' | 'part2' | 'part3' | 'part4';
}

export interface InvoiceCreatedEvent extends BaseEvent {
  type: 'invoice.created';
  invoice_id: string;
  client_id: string;
  total_cents: number;
  currency: string;
}

export interface InvoicePaidEvent extends BaseEvent {
  type: 'invoice.paid';
  invoice_id: string;
  client_id: string;
  amount_cents: number;
  currency: string;
  paid_at: string;
}

export interface PaymentReceivedEvent extends BaseEvent {
  type: 'payment.received';
  payment_id: string;
  invoice_id: string;
  amount_cents: number;
  currency: string;
}

export interface ExpenseCreatedEvent extends BaseEvent {
  type: 'expense.created';
  expense_id: string;
  amount_cents: number;
  currency: string;
  category_id: string;
  vendor_id?: string;
  date: string;
  is_tax_deductible: boolean;
}

export interface BankTransactionImportedEvent extends BaseEvent {
  type: 'bank_transaction.imported';
  transaction_id: string;
  bank_account_id: string;
  amount_cents: number;
  date: string;
}

export interface ExpenseCategorizedEvent extends BaseEvent {
  type: 'expense.categorized';
  expense_id: string;
  category_id: string;
  tax_category?: string;
}

export interface TaxEstimateUpdatedEvent extends BaseEvent {
  type: 'tax_estimate.updated';
  tax_year: number;
  estimated_tax_cents: number;
  quarterly_payment_due_cents: number;
  next_due_date: string;
}

export interface AnomalyDetectedEvent extends BaseEvent {
  type: 'anomaly.detected';
  anomaly_id: string;
  entity_type: string;
  entity_id: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface InsightCreatedEvent extends BaseEvent {
  type: 'insight.created';
  insight_id: string;
  insight_type: string;
  severity: string;
  title: string;
}

export interface MoneyAmount {
  cents: number;
  currency: string;
}

export const formatMoney = (cents: number, currency: string = 'USD'): string => {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
};

export const centsToMoney = (cents: number, currency: string = 'USD'): MoneyAmount => ({
  cents,
  currency
});

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    pagination?: {
      total: number;
      limit: number;
      offset: number;
      has_more: boolean;
    };
    computed_at?: string;
  };
}

export interface AuthHeaders {
  'x-organization-id': string;
  'x-user-id': string;
  'x-user-role': string;
  'x-request-id': string;
}
