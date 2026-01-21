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
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  PAYMENT_FAILED: 'PAYMENT_FAILED',
  INVOICE_ALREADY_PAID: 'INVOICE_ALREADY_PAID',
  ESCROW_NOT_FUNDED: 'ESCROW_NOT_FUNDED',
  STRIPE_ERROR: 'STRIPE_ERROR',
  PAYPAL_ERROR: 'PAYPAL_ERROR',
  EMAIL_DELIVERY_FAILED: 'EMAIL_DELIVERY_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  RATE_LIMITED: 'RATE_LIMITED'
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
