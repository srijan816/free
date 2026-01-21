export interface InvoiceLineItemInput {
  quantity: number;
  unit_price_cents: number;
}

export interface InvoiceTotals {
  subtotal_cents: number;
  discount_cents: number;
  tax_cents: number;
  total_cents: number;
  amount_paid_cents: number;
  amount_due_cents: number;
}

export function calculateInvoiceTotals(params: {
  line_items?: InvoiceLineItemInput[];
  discount_type?: 'percentage' | 'fixed';
  discount_value?: number | null;
  tax_rate?: number | null;
  amount_paid_cents?: number | null;
}): InvoiceTotals {
  const lineItems = params.line_items ?? [];
  const subtotal_cents = lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity ?? 0);
    const unitPrice = Number(item.unit_price_cents ?? 0);
    return sum + Math.round(quantity * unitPrice);
  }, 0);

  let discount_cents = 0;
  if (params.discount_value != null) {
    if (params.discount_type === 'percentage') {
      discount_cents = Math.round(subtotal_cents * (Number(params.discount_value) / 100));
    } else {
      discount_cents = Math.round(Number(params.discount_value));
    }
  }

  discount_cents = Math.min(Math.max(discount_cents, 0), subtotal_cents);
  const taxable_cents = subtotal_cents - discount_cents;

  let tax_cents = 0;
  if (params.tax_rate != null) {
    tax_cents = Math.round(taxable_cents * (Number(params.tax_rate) / 100));
  }

  const total_cents = taxable_cents + tax_cents;
  const amount_paid_cents = Math.max(0, Number(params.amount_paid_cents ?? 0));
  const amount_due_cents = Math.max(0, total_cents - amount_paid_cents);

  return {
    subtotal_cents,
    discount_cents,
    tax_cents,
    total_cents,
    amount_paid_cents,
    amount_due_cents
  };
}
