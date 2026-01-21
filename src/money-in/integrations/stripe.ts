import { ApiError, ERROR_CODES } from '../utils/errors.js';

export interface StripePaymentIntent {
  id: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded' | 'requires_action';
  amount: number;
  currency: string;
  client_secret: string;
}

export async function createPaymentIntent(params: {
  amount_cents: number;
  currency: string;
  metadata?: Record<string, string>;
}): Promise<StripePaymentIntent> {
  if (params.amount_cents <= 0) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Payment amount must be positive'
    });
  }

  return {
    id: `pi_${crypto.randomUUID()}`,
    status: 'requires_confirmation',
    amount: params.amount_cents,
    currency: params.currency,
    client_secret: `secret_${crypto.randomUUID()}`
  };
}

export async function verifyPaymentIntent(intentId: string): Promise<StripePaymentIntent> {
  return {
    id: intentId,
    status: 'succeeded',
    amount: 0,
    currency: 'USD',
    client_secret: `secret_${crypto.randomUUID()}`
  };
}

export async function refundPayment(_paymentIntentId: string, amount_cents: number) {
  if (amount_cents <= 0) {
    throw new ApiError({
      code: ERROR_CODES.INVALID_INPUT,
      message: 'Refund amount must be positive'
    });
  }

  return { refundId: `re_${crypto.randomUUID()}` };
}
