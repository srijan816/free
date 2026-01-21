import { sql } from 'kysely';
import { db } from '../db/index.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';
import type { RuleCondition } from './categorization.js';

interface ListRuleOptions {
  is_active?: boolean;
  category_id?: string;
  sort?: string;
}

export async function listRules(organizationId: string, options: ListRuleOptions) {
  let query = db
    .selectFrom('categorization_rules')
    .leftJoin('categories', 'categories.id', 'categorization_rules.category_id')
    .select([
      'categorization_rules.id',
      'categorization_rules.name',
      'categorization_rules.conditions',
      'categorization_rules.priority',
      'categorization_rules.is_active',
      'categorization_rules.is_system',
      'categorization_rules.match_count',
      'categorization_rules.last_matched_at',
      sql`json_build_object('id', categories.id, 'name', categories.name)`.as('category')
    ])
    .where('categorization_rules.organization_id', '=', organizationId);

  if (options.is_active != null) {
    query = query.where('categorization_rules.is_active', '=', options.is_active);
  }

  if (options.category_id) {
    query = query.where('categorization_rules.category_id', '=', options.category_id);
  }

  const sortMap: Record<string, string> = {
    priority: 'categorization_rules.priority',
    match_count: 'categorization_rules.match_count',
    last_matched_at: 'categorization_rules.last_matched_at'
  };
  const sortKey = options.sort?.replace('-', '') ?? 'priority';
  const sortColumn = sortMap[sortKey] ?? 'categorization_rules.priority';
  const sortDirection = options.sort?.startsWith('-') ? 'desc' : 'asc';

  return query.orderBy(sortColumn as never, sortDirection as never).execute();
}

export async function createRule(organizationId: string, payload: Record<string, any>) {
  const created = await db
    .insertInto('categorization_rules')
    .values({
      organization_id: organizationId,
      name: payload.name,
      conditions: payload.conditions,
      category_id: payload.category_id,
      vendor_id: payload.vendor_id ?? null,
      tags: payload.tags ?? [],
      priority: payload.priority ?? 0,
      is_active: true,
      is_system: false
    })
    .returningAll()
    .executeTakeFirst();

  return created;
}

export async function updateRule(organizationId: string, ruleId: string, updates: Record<string, any>) {
  const updated = await db
    .updateTable('categorization_rules')
    .set({
      name: updates.name,
      conditions: updates.conditions,
      category_id: updates.category_id,
      vendor_id: updates.vendor_id,
      tags: updates.tags,
      priority: updates.priority,
      is_active: updates.is_active
    })
    .where('organization_id', '=', organizationId)
    .where('id', '=', ruleId)
    .returningAll()
    .executeTakeFirst();

  if (!updated) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Rule not found',
      statusCode: 404
    });
  }

  return updated;
}

export async function deleteRule(organizationId: string, ruleId: string) {
  const deleted = await db
    .deleteFrom('categorization_rules')
    .where('organization_id', '=', organizationId)
    .where('id', '=', ruleId)
    .executeTakeFirst();

  if (!deleted) {
    throw new ApiError({
      code: ERROR_CODES.NOT_FOUND,
      message: 'Rule not found',
      statusCode: 404
    });
  }

  return { id: ruleId, deleted: true };
}

export async function testRule(organizationId: string, conditions: RuleCondition[], limit: number) {
  const transactions = await db
    .selectFrom('bank_transactions')
    .select(['id', 'name', 'amount_cents', 'date', 'category_id'])
    .where('organization_id', '=', organizationId)
    .limit(limit)
    .execute();

  const matching = transactions.filter((transaction) => matchesRule(transaction, conditions));

  return {
    matching_transactions: matching.map((transaction: any) => ({
      id: transaction.id,
      name: transaction.name,
      amount_cents: transaction.amount_cents,
      date: transaction.date,
      current_category: transaction.category_id
    })),
    match_count: matching.length,
    would_recategorize: matching.filter((transaction: any) => transaction.category_id !== null).length
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
