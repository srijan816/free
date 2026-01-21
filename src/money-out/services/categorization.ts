import { db } from '../db/index.js';
import { aiCategorizeTransaction } from '../integrations/ai.js';

export interface RuleCondition {
  field: 'merchant_name' | 'name' | 'amount' | 'category' | 'account' | 'plaid_category';
  operator:
    | 'contains'
    | 'equals'
    | 'starts_with'
    | 'ends_with'
    | 'greater_than'
    | 'less_than'
    | 'between'
    | 'regex';
  value: string | number | [number, number];
  case_sensitive?: boolean;
}

export interface CategorizationResult {
  category_id: string | null;
  method: 'rule' | 'ai' | 'plaid' | null;
  confidence: number;
  rule_id?: string;
  suggestions?: Array<{ category_id: string; category_name: string; confidence: number; reason: string }>;
}

export async function categorizeTransaction(transaction: any, organizationId: string): Promise<CategorizationResult> {
  if (transaction.vendor_id) {
    const vendor = await db
      .selectFrom('vendors')
      .select(['default_category_id'])
      .where('id', '=', transaction.vendor_id)
      .executeTakeFirst();
    if (vendor?.default_category_id) {
      return {
        category_id: vendor.default_category_id,
        method: 'rule',
        confidence: 95
      };
    }
  }

  const rules = await db
    .selectFrom('categorization_rules')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .where('is_active', '=', true)
    .orderBy('priority', 'desc')
    .execute();

  for (const rule of rules as any[]) {
    const conditions = rule.conditions as RuleCondition[];
    if (matchesRule(transaction, conditions)) {
      await db
        .updateTable('categorization_rules')
        .set({
          match_count: rule.match_count + 1,
          last_matched_at: new Date().toISOString()
        })
        .where('id', '=', rule.id)
        .execute();

      return {
        category_id: rule.category_id,
        method: 'rule',
        confidence: 90,
        rule_id: rule.id
      };
    }
  }

  const categories = await db
    .selectFrom('categories')
    .select(['id', 'name'])
    .where('organization_id', '=', organizationId)
    .where('type', '=', 'expense')
    .execute();

  const aiResult = await aiCategorizeTransaction({
    description: transaction.name,
    merchant: transaction.merchant_name,
    categories
  });

  if (aiResult.category_id && aiResult.confidence >= 70) {
    return {
      category_id: aiResult.category_id,
      method: 'ai',
      confidence: aiResult.confidence
    };
  }

  if (transaction.plaid_category_id) {
    const mapped = await mapPlaidCategory(transaction.plaid_category_id, organizationId);
    if (mapped) {
      return {
        category_id: mapped.id,
        method: 'plaid',
        confidence: 60
      };
    }
  }

  return {
    category_id: null,
    method: null,
    confidence: 0,
    suggestions: (aiResult.suggestions ?? []).map((suggestion) => ({
      category_id: suggestion.category_id,
      category_name: categories.find((c) => c.id === suggestion.category_id)?.name ?? 'Unknown',
      confidence: suggestion.confidence,
      reason: 'ai_suggestion'
    }))
  };
}

function matchesRule(transaction: any, conditions: RuleCondition[]) {
  return conditions.every((condition) => {
    const value = getFieldValue(transaction, condition.field);
    return evaluateCondition(value, condition);
  });
}

function getFieldValue(transaction: any, field: string) {
  switch (field) {
    case 'merchant_name':
      return transaction.merchant_name || transaction.name;
    case 'name':
      return transaction.name;
    case 'amount':
      return transaction.amount_cents;
    case 'category':
      return transaction.plaid_category_id;
    case 'plaid_category':
      return transaction.plaid_category?.join(' ') ?? null;
    case 'account':
      return transaction.bank_account_id;
    default:
      return null;
  }
}

function evaluateCondition(value: string | number | null, condition: RuleCondition) {
  if (value == null) return false;

  const compareValue = condition.case_sensitive ? String(value) : String(value).toLowerCase();
  const compareTarget = condition.case_sensitive
    ? String(condition.value)
    : String(condition.value).toLowerCase();

  switch (condition.operator) {
    case 'contains':
      return compareValue.includes(compareTarget);
    case 'equals':
      return compareValue === compareTarget;
    case 'starts_with':
      return compareValue.startsWith(compareTarget);
    case 'ends_with':
      return compareValue.endsWith(compareTarget);
    case 'greater_than':
      return Number(value) > Number(condition.value);
    case 'less_than':
      return Number(value) < Number(condition.value);
    case 'between': {
      const [min, max] = condition.value as [number, number];
      return Number(value) >= min && Number(value) <= max;
    }
    case 'regex': {
      try {
        const regex = new RegExp(String(condition.value), condition.case_sensitive ? '' : 'i');
        return regex.test(String(value));
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
}

async function mapPlaidCategory(plaidCategoryId: string, organizationId: string) {
  const category = await db
    .selectFrom('categories')
    .select(['id', 'name'])
    .where('organization_id', '=', organizationId)
    .where('type', '=', 'expense')
    .executeTakeFirst();
  return category ?? null;
}
