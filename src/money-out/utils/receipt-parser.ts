export interface ReceiptExtractedData {
  vendor_name?: string;
  vendor_address?: string;
  vendor_phone?: string;
  total_amount?: number;
  total_amount_cents?: number;
  currency?: string;
  subtotal?: number;
  tax_amount?: number;
  tip_amount?: number;
  transaction_date?: string;
  transaction_time?: string;
  payment_method?: string;
  last_four_digits?: string;
  line_items?: Array<{ description: string; quantity?: number; unit_price?: number; total_price?: number }>;
  raw_total_string?: string;
  raw_date_string?: string;
}

export class ReceiptParser {
  parseReceiptText(text: string): ReceiptExtractedData {
    const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

    const vendorName = this.extractVendorName(lines);
    const total = this.extractTotal(lines);
    const date = this.extractDate(lines);
    const tax = this.extractTax(lines);
    const paymentMethod = this.extractPaymentMethod(lines);
    const lastFour = this.extractCardDigits(lines);

    const result: ReceiptExtractedData = {
      vendor_name: vendorName,
      total_amount: total ?? undefined,
      transaction_date: date ?? undefined,
      tax_amount: tax ?? undefined,
      payment_method: paymentMethod ?? undefined,
      last_four_digits: lastFour ?? undefined,
      line_items: this.extractLineItems(lines),
      raw_total_string: this.findTotalLine(lines),
      raw_date_string: this.findDateLine(lines)
    };

    if (typeof total === 'number') {
      result.total_amount_cents = Math.round(total * 100);
    }

    return result;
  }

  private extractTotal(lines: string[]): number | undefined {
    const patterns = [
      /(?:total|amount|sum|grand total)[:\s]*\$?([\d,]+\.?\d*)/i,
      /\$\s*([\d,]+\.\d{2})\s*$/,
      /(?:charged?|paid)[:\s]*\$?([\d,]+\.?\d*)/i
    ];

    for (const line of [...lines].reverse()) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          return parseFloat(match[1].replace(/,/g, ''));
        }
      }
    }

    return undefined;
  }

  private extractDate(lines: string[]): string | undefined {
    const patterns = [
      /(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/,
      /(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})/i,
      /(\d{4})-(\d{2})-(\d{2})/
    ];

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          return this.normalizeDate(match[0]);
        }
      }
    }

    return undefined;
  }

  private normalizeDate(raw: string): string {
    const match = raw.match(/(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})/);
    if (match) {
      const month = match[1].padStart(2, '0');
      const day = match[2].padStart(2, '0');
      const year = match[3].length === 2 ? `20${match[3]}` : match[3];
      return `${year}-${month}-${day}`;
    }

    const monthMatch = raw.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2}),?\s+(\d{2,4})/i);
    if (monthMatch) {
      const monthMap: Record<string, string> = {
        jan: '01',
        feb: '02',
        mar: '03',
        apr: '04',
        may: '05',
        jun: '06',
        jul: '07',
        aug: '08',
        sep: '09',
        oct: '10',
        nov: '11',
        dec: '12'
      };
      const month = monthMap[monthMatch[1].slice(0, 3).toLowerCase()];
      const day = monthMatch[2].padStart(2, '0');
      const year = monthMatch[3].length === 2 ? `20${monthMatch[3]}` : monthMatch[3];
      return `${year}-${month}-${day}`;
    }

    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString().split('T')[0];
    }

    return raw;
  }

  private extractVendorName(lines: string[]): string | undefined {
    const businessPatterns = [/inc\.?$/i, /llc\.?$/i, /corp\.?$/i, /ltd\.?$/i, /co\.?$/i];

    for (const line of lines.slice(0, 5)) {
      if (/^\d+\s+\w+\s+(st|ave|blvd|rd|dr)/i.test(line)) continue;
      if (/\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}/.test(line)) continue;

      if (businessPatterns.some((pattern) => pattern.test(line))) {
        return line;
      }

      if (line.length > 3 && line.length < 50 && /^[A-Za-z]/.test(line)) {
        return line;
      }
    }

    return lines[0];
  }

  private extractTax(lines: string[]): number | undefined {
    const pattern = /(?:tax)[:\s]*\$?([\d,]+\.?\d*)/i;
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        return parseFloat(match[1].replace(/,/g, ''));
      }
    }
    return undefined;
  }

  private extractPaymentMethod(lines: string[]): string | undefined {
    const methods = ['visa', 'mastercard', 'amex', 'discover', 'cash', 'debit', 'credit'];
    for (const line of lines) {
      const lower = line.toLowerCase();
      for (const method of methods) {
        if (lower.includes(method)) return method;
      }
    }
    return undefined;
  }

  private extractCardDigits(lines: string[]): string | undefined {
    const pattern = /(?:\*{2,}|x{2,})\s*(\d{4})/i;
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) return match[1];
    }
    return undefined;
  }

  private extractLineItems(lines: string[]): Array<{ description: string; quantity?: number; unit_price?: number; total_price?: number }> {
    const items: Array<{ description: string; quantity?: number; unit_price?: number; total_price?: number }> = [];

    for (const line of lines) {
      const match = line.match(/(.+)\s+([0-9]+)\s+\$?([0-9]+\.?[0-9]*)$/);
      if (match) {
        items.push({
          description: match[1].trim(),
          quantity: Number(match[2]),
          total_price: Number(match[3])
        });
      }
    }

    return items.length ? items : [];
  }

  private findTotalLine(lines: string[]): string | undefined {
    const pattern = /(total|amount|grand total)/i;
    for (const line of [...lines].reverse()) {
      if (pattern.test(line)) return line;
    }
    return undefined;
  }

  private findDateLine(lines: string[]): string | undefined {
    const pattern = /(\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}|\d{4}-\d{2}-\d{2})/;
    for (const line of lines) {
      if (pattern.test(line)) return line;
    }
    return undefined;
  }
}
