import { db } from '../db/index.js';
import { SUBSCRIPTION_PLANS, SubscriptionPlan } from '../constants/index.js';
import { countUsersByOrganization } from './users.js';

export async function getSubscription(organizationId: string) {
  const org = await db.selectFrom('organizations').selectAll().where('id', '=', organizationId).executeTakeFirst();
  return {
    plan: org?.subscription_plan || 'free',
    status: org?.subscription_status || 'active',
    started_at: org?.subscription_started_at,
    ends_at: org?.subscription_ends_at,
    trial_ends_at: org?.trial_ends_at
  };
}

export async function createCheckoutSession(
  organizationId: string,
  plan: SubscriptionPlan,
  billingPeriod: 'monthly' | 'yearly'
) {
  const planConfig = SUBSCRIPTION_PLANS[plan];
  const price = billingPeriod === 'yearly' ? planConfig.price_yearly_cents : planConfig.price_monthly_cents;
  return {
    checkout_url: `https://billing.local/checkout?org=${organizationId}&plan=${plan}&period=${billingPeriod}&price=${price}`
  };
}

export async function createBillingPortalSession(organizationId: string) {
  return {
    portal_url: `https://billing.local/portal?org=${organizationId}`
  };
}

export async function cancelSubscription(organizationId: string) {
  await db.updateTable('organizations').set({ subscription_status: 'cancelled' }).where('id', '=', organizationId).execute();
}

export async function resumeSubscription(organizationId: string) {
  await db.updateTable('organizations').set({ subscription_status: 'active' }).where('id', '=', organizationId).execute();
}

export async function getBillingHistory(organizationId: string, options: { limit?: number; offset?: number }) {
  const limit = options.limit ?? 20;
  const offset = options.offset ?? 0;

  const [rows, countRow] = await Promise.all([
    db
      .selectFrom('billing_history')
      .selectAll()
      .where('organization_id', '=', organizationId)
      .orderBy('created_at', 'desc')
      .limit(limit)
      .offset(offset)
      .execute(),
    db
      .selectFrom('billing_history')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('organization_id', '=', organizationId)
      .executeTakeFirst()
  ]);

  const total = Number(countRow?.count ?? 0);

  return {
    history: rows,
    pagination: {
      total,
      limit,
      offset,
      has_more: offset + rows.length < total
    }
  };
}

export async function getUsage(organizationId: string) {
  const org = await db.selectFrom('organizations').selectAll().where('id', '=', organizationId).executeTakeFirst();
  const usersCount = await countUsersByOrganization(organizationId);
  const plan = (org?.subscription_plan || 'free') as SubscriptionPlan;

  return {
    plan,
    limits: SUBSCRIPTION_PLANS[plan].limits,
    usage: {
      invoices_this_month: org?.invoices_this_month || 0,
      storage_mb: Math.ceil((org?.storage_used_bytes || 0) / (1024 * 1024)),
      team_members: usersCount
    }
  };
}
