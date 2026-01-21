// ============================================
// CURRENCY
// ============================================
export const SUPPORTED_CURRENCIES = [
  'USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF', 'CNY', 'INR', 'MXN', 'BRL'
] as const;

export const DEFAULT_CURRENCY = 'USD';

// ============================================
// TIMEZONES
// ============================================
export const SUPPORTED_TIMEZONES = [
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Toronto',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Asia/Mumbai',
  'Australia/Sydney',
  'Pacific/Auckland'
] as const;

export const DEFAULT_TIMEZONE = 'America/New_York';

// ============================================
// USER ROLES & PERMISSIONS
// ============================================
export const USER_ROLES = ['owner', 'admin', 'member', 'accountant', 'viewer'] as const;
export type UserRole = typeof USER_ROLES[number];

export const PERMISSIONS = {
  // Organization
  'org:read': 'View organization details',
  'org:update': 'Update organization settings',
  'org:delete': 'Delete organization',
  'org:billing': 'Manage billing',

  // Users
  'users:read': 'View team members',
  'users:invite': 'Invite team members',
  'users:update': 'Update team members',
  'users:remove': 'Remove team members',

  // Part 1: Money In
  'clients:read': 'View clients',
  'clients:write': 'Create/edit clients',
  'clients:delete': 'Delete clients',
  'invoices:read': 'View invoices',
  'invoices:write': 'Create/edit invoices',
  'invoices:delete': 'Delete invoices',
  'invoices:send': 'Send invoices',
  'payments:read': 'View payments',
  'payments:write': 'Record payments',
  'payments:refund': 'Process refunds',
  'escrow:read': 'View escrow',
  'escrow:manage': 'Manage escrow releases',

  // Part 2: Money Out
  'expenses:read': 'View expenses',
  'expenses:write': 'Create/edit expenses',
  'expenses:delete': 'Delete expenses',
  'expenses:approve': 'Approve expenses',
  'vendors:read': 'View vendors',
  'vendors:write': 'Create/edit vendors',
  'banking:read': 'View bank connections',
  'banking:connect': 'Connect bank accounts',
  'banking:disconnect': 'Disconnect bank accounts',
  'receipts:read': 'View receipts',
  'receipts:upload': 'Upload receipts',

  // Part 3: Intelligence
  'dashboard:read': 'View dashboard',
  'reports:read': 'View reports',
  'reports:export': 'Export reports',
  'tax:read': 'View tax data',
  'tax:write': 'Update tax settings',
  'insights:read': 'View insights',
  'budgets:read': 'View budgets',
  'budgets:write': 'Create/edit budgets',

  // Admin
  'admin:access': 'Access admin panel',
  'audit:read': 'View audit logs'
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: Object.keys(PERMISSIONS) as Permission[],
  admin: [
    'org:read', 'org:update',
    'users:read', 'users:invite', 'users:update', 'users:remove',
    'clients:read', 'clients:write', 'clients:delete',
    'invoices:read', 'invoices:write', 'invoices:delete', 'invoices:send',
    'payments:read', 'payments:write', 'payments:refund',
    'escrow:read', 'escrow:manage',
    'expenses:read', 'expenses:write', 'expenses:delete', 'expenses:approve',
    'vendors:read', 'vendors:write',
    'banking:read', 'banking:connect', 'banking:disconnect',
    'receipts:read', 'receipts:upload',
    'dashboard:read', 'reports:read', 'reports:export',
    'tax:read', 'tax:write',
    'insights:read',
    'budgets:read', 'budgets:write',
    'audit:read'
  ],
  member: [
    'org:read',
    'clients:read', 'clients:write',
    'invoices:read', 'invoices:write', 'invoices:send',
    'payments:read', 'payments:write',
    'escrow:read',
    'expenses:read', 'expenses:write',
    'vendors:read', 'vendors:write',
    'banking:read',
    'receipts:read', 'receipts:upload',
    'dashboard:read', 'reports:read',
    'tax:read',
    'insights:read',
    'budgets:read'
  ],
  accountant: [
    'org:read',
    'clients:read',
    'invoices:read',
    'payments:read',
    'expenses:read', 'expenses:approve',
    'vendors:read',
    'banking:read',
    'receipts:read',
    'dashboard:read', 'reports:read', 'reports:export',
    'tax:read', 'tax:write',
    'insights:read',
    'budgets:read', 'budgets:write',
    'audit:read'
  ],
  viewer: [
    'org:read',
    'clients:read',
    'invoices:read',
    'payments:read',
    'expenses:read',
    'vendors:read',
    'banking:read',
    'receipts:read',
    'dashboard:read', 'reports:read',
    'tax:read',
    'insights:read',
    'budgets:read'
  ]
};

// ============================================
// SUBSCRIPTION PLANS
// ============================================
export const SUBSCRIPTION_PLANS = {
  free: {
    name: 'Free',
    price_monthly_cents: 0,
    price_yearly_cents: 0,
    limits: {
      invoices_per_month: 5,
      clients: 3,
      bank_connections: 1,
      team_members: 1,
      storage_mb: 100,
      reports: ['profit_and_loss'],
      features: ['basic_invoicing', 'basic_expenses']
    }
  },
  starter: {
    name: 'Starter',
    price_monthly_cents: 2900,
    price_yearly_cents: 29000,
    limits: {
      invoices_per_month: 50,
      clients: 25,
      bank_connections: 2,
      team_members: 1,
      storage_mb: 1000,
      reports: ['profit_and_loss', 'cash_flow', 'expense_by_category'],
      features: ['basic_invoicing', 'basic_expenses', 'bank_sync', 'receipt_scanning']
    }
  },
  professional: {
    name: 'Professional',
    price_monthly_cents: 7900,
    price_yearly_cents: 79000,
    limits: {
      invoices_per_month: -1,
      clients: -1,
      bank_connections: 5,
      team_members: 3,
      storage_mb: 10000,
      reports: 'all',
      features: [
        'basic_invoicing', 'recurring_invoices', 'escrow',
        'basic_expenses', 'bank_sync', 'receipt_scanning', 'auto_categorization',
        'all_reports', 'tax_prep', 'forecasting', 'insights'
      ]
    }
  },
  business: {
    name: 'Business',
    price_monthly_cents: 14900,
    price_yearly_cents: 149000,
    limits: {
      invoices_per_month: -1,
      clients: -1,
      bank_connections: -1,
      team_members: 10,
      storage_mb: 50000,
      reports: 'all',
      features: [
        'all_professional_features',
        'white_label', 'api_access', 'priority_support',
        'custom_reports', 'multi_currency', 'team_permissions'
      ]
    }
  }
} as const;

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS;

// ============================================
// RATE LIMITS
// ============================================
export const RATE_LIMITS = {
  free: {
    requests_per_minute: 30,
    requests_per_hour: 500,
    requests_per_day: 2000
  },
  starter: {
    requests_per_minute: 60,
    requests_per_hour: 1000,
    requests_per_day: 10000
  },
  professional: {
    requests_per_minute: 120,
    requests_per_hour: 3000,
    requests_per_day: 50000
  },
  business: {
    requests_per_minute: 300,
    requests_per_hour: 10000,
    requests_per_day: 200000
  }
} as const;

// ============================================
// SERVICE IDENTIFIERS
// ============================================
export const SERVICES = {
  PART1_MONEY_IN: 'part1-money-in',
  PART2_MONEY_OUT: 'part2-money-out',
  PART3_INTELLIGENCE: 'part3-intelligence',
  PART4_INTEGRATION: 'part4-integration'
} as const;

// ============================================
// EVENT CHANNELS
// ============================================
export const EVENT_CHANNELS = {
  INVOICE_EVENTS: 'events:invoice',
  PAYMENT_EVENTS: 'events:payment',
  CLIENT_EVENTS: 'events:client',
  ESCROW_EVENTS: 'events:escrow',
  EXPENSE_EVENTS: 'events:expense',
  BANK_EVENTS: 'events:bank',
  VENDOR_EVENTS: 'events:vendor',
  RECEIPT_EVENTS: 'events:receipt',
  REPORT_EVENTS: 'events:report',
  TAX_EVENTS: 'events:tax',
  INSIGHT_EVENTS: 'events:insight',
  FORECAST_EVENTS: 'events:forecast',
  USER_EVENTS: 'events:user',
  ORG_EVENTS: 'events:organization',
  BILLING_EVENTS: 'events:billing',
  NOTIFICATION_EVENTS: 'events:notification'
} as const;
