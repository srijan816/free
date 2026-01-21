const MERCHANT_PATTERNS: Array<{ pattern: RegExp; clean: string }> = [
  { pattern: /^AMZN MKTP US\*.*/i, clean: 'Amazon' },
  { pattern: /^AMAZON\..*/i, clean: 'Amazon' },
  { pattern: /^GOOGLE \*[A-Z]+/i, clean: 'Google' },
  { pattern: /^UBER \*?(TRIP|EATS)/i, clean: 'Uber' },
  { pattern: /^LYFT \*RIDE/i, clean: 'Lyft' },
  { pattern: /^SQ \*(.+)/i, clean: '$1' },
  { pattern: /^TST\* (.+)/i, clean: '$1' }
];

export function cleanMerchantName(rawName: string): string {
  for (const { pattern, clean } of MERCHANT_PATTERNS) {
    if (pattern.test(rawName)) {
      return rawName.replace(pattern, clean).trim();
    }
  }

  return rawName
    .replace(/[#*]/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\d{4,}/g, '')
    .trim()
    .substring(0, 100);
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
}

function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));
  if (!tokensA.size || !tokensB.size) return 0;

  let intersection = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersection += 1;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function calculateMatchScore(merchantName: string, vendor: {
  name: string;
  display_name?: string | null;
  bank_merchant_names?: string[] | null;
}): number {
  const cleaned = normalize(cleanMerchantName(merchantName));
  const candidates = [vendor.display_name, vendor.name, ...(vendor.bank_merchant_names ?? [])]
    .filter(Boolean)
    .map((value) => normalize(String(value)));

  for (const candidate of candidates) {
    if (!candidate) continue;
    if (cleaned === candidate) return 100;
    if (cleaned.includes(candidate) || candidate.includes(cleaned)) return 80;
  }

  let best = 0;
  for (const candidate of candidates) {
    const similarity = tokenSimilarity(cleaned, candidate);
    if (similarity > best) best = similarity;
  }

  if (best >= 0.6) return 75;
  if (best >= 0.45) return 60;
  return Math.round(best * 50);
}
