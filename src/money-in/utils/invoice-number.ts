interface InvoiceNumberSettings {
  pattern: string;
  next_number: number;
  reset_frequency: 'never' | 'yearly' | 'monthly';
  last_reset_at?: string | null;
}

export function maybeResetSequence(settings: InvoiceNumberSettings, now = new Date()) {
  if (settings.reset_frequency === 'never') {
    return settings;
  }

  const lastReset = settings.last_reset_at ? new Date(settings.last_reset_at) : null;

  if (!lastReset) {
    return {
      ...settings,
      next_number: 1,
      last_reset_at: now.toISOString()
    };
  }

  const sameYear = lastReset.getUTCFullYear() === now.getUTCFullYear();
  const sameMonth = sameYear && lastReset.getUTCMonth() === now.getUTCMonth();

  if (settings.reset_frequency === 'yearly' && !sameYear) {
    return {
      ...settings,
      next_number: 1,
      last_reset_at: now.toISOString()
    };
  }

  if (settings.reset_frequency === 'monthly' && !sameMonth) {
    return {
      ...settings,
      next_number: 1,
      last_reset_at: now.toISOString()
    };
  }

  return settings;
}

export function formatInvoiceNumber(
  pattern: string,
  sequence: number,
  options: { now?: Date; prefix?: string } = {}
): string {
  const now = options.now ?? new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  const yearShort = String(year).slice(-2);

  const numberRegex = /\{NUMBER(?::(\d+))?\}/g;

  let formatted = pattern
    .replace(/\{YEAR\}/g, String(year))
    .replace(/\{YEAR_SHORT\}/g, yearShort)
    .replace(/\{MONTH\}/g, month)
    .replace(/\{PREFIX\}/g, options.prefix ?? '');

  formatted = formatted.replace(numberRegex, (_match, padLength) => {
    if (padLength) {
      return String(sequence).padStart(Number(padLength), '0');
    }
    return String(sequence);
  });

  return formatted;
}

export function generateInvoiceNumber(settings: InvoiceNumberSettings, options?: { now?: Date; prefix?: string }) {
  const normalized = maybeResetSequence(settings, options?.now);
  const invoiceNumber = formatInvoiceNumber(normalized.pattern, normalized.next_number, options);

  return {
    invoiceNumber,
    nextNumber: normalized.next_number + 1,
    lastResetAt: normalized.last_reset_at ?? null
  };
}
