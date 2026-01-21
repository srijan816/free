export const EXPENSE_STATUSES = {
  PENDING: 'pending',
  CATEGORIZED: 'categorized',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  REIMBURSED: 'reimbursed'
} as const;

export const TRANSACTION_TYPES = {
  DEBIT: 'debit',
  CREDIT: 'credit',
  TRANSFER: 'transfer'
} as const;

export const BANK_ACCOUNT_TYPES = {
  CHECKING: 'checking',
  SAVINGS: 'savings',
  CREDIT_CARD: 'credit_card',
  INVESTMENT: 'investment',
  LOAN: 'loan',
  OTHER: 'other'
} as const;

export const BANK_CONNECTION_STATUSES = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  ERROR: 'error',
  PENDING: 'pending',
  REQUIRES_REAUTH: 'requires_reauth'
} as const;

export const RECEIPT_STATUSES = {
  UPLOADED: 'uploaded',
  PROCESSING: 'processing',
  PROCESSED: 'processed',
  FAILED: 'failed',
  MATCHED: 'matched'
} as const;

export const EXPENSE_PAYMENT_METHODS = {
  CASH: 'cash',
  DEBIT_CARD: 'debit_card',
  CREDIT_CARD: 'credit_card',
  BANK_TRANSFER: 'bank_transfer',
  CHECK: 'check',
  PAYPAL: 'paypal',
  VENMO: 'venmo',
  OTHER: 'other'
} as const;

export const MILEAGE_RATE_TYPE = {
  STANDARD: 'standard',
  ACTUAL: 'actual'
} as const;

export const MILEAGE_RATES = {
  '2025': {
    business: 0.70,
    medical: 0.22,
    charity: 0.14
  },
  '2026': {
    business: 0.72,
    medical: 0.23,
    charity: 0.14
  }
} as const;

export const RECURRENCE_FREQUENCIES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  BIWEEKLY: 'biweekly',
  MONTHLY: 'monthly',
  QUARTERLY: 'quarterly',
  YEARLY: 'yearly',
  CUSTOM: 'custom'
} as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  {
    name: 'Advertising',
    tax_category: 'schedule_c_line_8',
    description: 'Advertising and marketing expenses'
  },
  {
    name: 'Car and Truck Expenses',
    tax_category: 'schedule_c_line_9',
    description: 'Vehicle expenses not claimed elsewhere'
  },
  {
    name: 'Commissions and Fees',
    tax_category: 'schedule_c_line_10',
    description: 'Commissions paid to non-employees'
  },
  {
    name: 'Contract Labor',
    tax_category: 'schedule_c_line_11',
    description: 'Payments to independent contractors'
  },
  {
    name: 'Depreciation',
    tax_category: 'schedule_c_line_13',
    description: 'Depreciation of business assets'
  },
  {
    name: 'Insurance',
    tax_category: 'schedule_c_line_15',
    description: 'Business insurance premiums'
  },
  {
    name: 'Interest (Mortgage)',
    tax_category: 'schedule_c_line_16a',
    description: 'Mortgage interest on business property'
  },
  {
    name: 'Interest (Other)',
    tax_category: 'schedule_c_line_16b',
    description: 'Other business interest expenses'
  },
  {
    name: 'Legal and Professional Services',
    tax_category: 'schedule_c_line_17',
    description: 'Fees for attorneys, accountants, etc.'
  },
  {
    name: 'Office Expenses',
    tax_category: 'schedule_c_line_18',
    description: 'General office supplies and expenses'
  },
  {
    name: 'Rent or Lease (Vehicles)',
    tax_category: 'schedule_c_line_20a',
    description: 'Vehicle rental and lease payments'
  },
  {
    name: 'Rent or Lease (Equipment)',
    tax_category: 'schedule_c_line_20b',
    description: 'Equipment rental and lease payments'
  },
  {
    name: 'Rent or Lease (Property)',
    tax_category: 'schedule_c_line_20b',
    description: 'Office or property rental'
  },
  {
    name: 'Repairs and Maintenance',
    tax_category: 'schedule_c_line_21',
    description: 'Repairs to business equipment and property'
  },
  {
    name: 'Supplies',
    tax_category: 'schedule_c_line_22',
    description: 'Materials and supplies consumed'
  },
  {
    name: 'Taxes and Licenses',
    tax_category: 'schedule_c_line_23',
    description: 'Business taxes and license fees'
  },
  {
    name: 'Travel',
    tax_category: 'schedule_c_line_24a',
    description: 'Business travel expenses (not meals)'
  },
  {
    name: 'Meals',
    tax_category: 'schedule_c_line_24b',
    description: 'Business meals (50% deductible)',
    deduction_percentage: 50
  },
  {
    name: 'Utilities',
    tax_category: 'schedule_c_line_25',
    description: 'Utilities for business property'
  },
  {
    name: 'Software and Subscriptions',
    tax_category: 'schedule_c_line_27a',
    description: 'Software, SaaS, and subscriptions'
  },
  {
    name: 'Education and Training',
    tax_category: 'schedule_c_line_27a',
    description: 'Professional development'
  },
  {
    name: 'Bank and Payment Fees',
    tax_category: 'schedule_c_line_27a',
    description: 'Bank fees, payment processing fees'
  },
  {
    name: 'Home Office',
    tax_category: 'schedule_c_line_30',
    description: 'Home office deduction'
  },
  {
    name: 'Personal',
    tax_category: 'non_deductible',
    description: 'Personal expenses (not deductible)',
    is_tax_deductible: false
  },
  {
    name: 'Uncategorized',
    tax_category: 'none',
    description: 'Needs categorization',
    is_system: true
  }
] as const;
