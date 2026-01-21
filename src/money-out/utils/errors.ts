export const ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  CONFLICT: 'CONFLICT',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED',
  BANK_CONNECTION_FAILED: 'BANK_CONNECTION_FAILED',
  BANK_REQUIRES_REAUTH: 'BANK_REQUIRES_REAUTH',
  BANK_NOT_SUPPORTED: 'BANK_NOT_SUPPORTED',
  PLAID_ERROR: 'PLAID_ERROR',
  RECEIPT_PROCESSING_FAILED: 'RECEIPT_PROCESSING_FAILED',
  RECEIPT_UNREADABLE: 'RECEIPT_UNREADABLE',
  RECEIPT_DUPLICATE: 'RECEIPT_DUPLICATE',
  EXPENSE_ALREADY_RECONCILED: 'EXPENSE_ALREADY_RECONCILED',
  DUPLICATE_TRANSACTION: 'DUPLICATE_TRANSACTION',
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',
  SYNC_IN_PROGRESS: 'SYNC_IN_PROGRESS',
  SYNC_FAILED: 'SYNC_FAILED'
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

export class ApiError extends Error {
  code: ErrorCode;
  statusCode: number;
  details?: Record<string, unknown>;
  fieldErrors?: Array<{ field: string; message: string; code: string }>;

  constructor(options: {
    code: ErrorCode;
    message: string;
    statusCode?: number;
    details?: Record<string, unknown>;
    fieldErrors?: Array<{ field: string; message: string; code: string }>;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.statusCode = options.statusCode ?? 400;
    this.details = options.details;
    this.fieldErrors = options.fieldErrors;
  }
}
