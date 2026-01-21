import crypto from 'node:crypto';
import { sql } from 'kysely';
import { db } from '../db/index.js';
import { EventBusService } from './event-bus.js';
import type { BaseEvent } from './event-bus.js';

type WorkflowJob = {
  id: string;
  workflow_type: string;
  organization_id: string;
  run_at: Date;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  attempts: number;
  max_attempts: number;
  payload: Record<string, any>;
  dedupe_key?: string | null;
};

export class WorkflowSchedulerService {
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly eventBus: EventBusService) {}

  start(pollIntervalMs: number = 30000) {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), pollIntervalMs);
    void this.tick();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async scheduleJob(params: {
    workflow_type: string;
    organization_id: string;
    run_at: Date;
    payload: Record<string, any>;
    dedupe_key?: string;
    max_attempts?: number;
  }) {
    await db
      .insertInto('workflow_jobs')
      .values({
        workflow_type: params.workflow_type,
        organization_id: params.organization_id,
        run_at: params.run_at,
        payload: params.payload,
        dedupe_key: params.dedupe_key ?? null,
        max_attempts: params.max_attempts ?? 5
      })
      .onConflict((oc) =>
        oc.columns(['dedupe_key']).doUpdateSet({
          run_at: params.run_at,
          payload: params.payload,
          updated_at: sql`NOW()`
        })
      )
      .execute();
  }

  async cancelJobByDedupeKey(dedupeKey: string) {
    await db
      .updateTable('workflow_jobs')
      .set({ status: 'cancelled', updated_at: sql`NOW()` })
      .where('dedupe_key', '=', dedupeKey)
      .where('status', 'in', ['queued', 'running'] as any)
      .execute();
  }

  private async tick() {
    if (this.running) return;
    this.running = true;
    try {
      await this.processDueJobs();
      await this.processQuarterlyTaxRecap();
    } finally {
      this.running = false;
    }
  }

  private async processDueJobs() {
    const dueJobs = await db
      .selectFrom('workflow_jobs')
      .selectAll()
      .where('status', '=', 'queued')
      .where('run_at', '<=', new Date())
      .orderBy('run_at', 'asc')
      .limit(25)
      .execute();

    for (const job of dueJobs as WorkflowJob[]) {
      await this.runJob(job);
    }
  }

  private async runJob(job: WorkflowJob) {
    await db
      .updateTable('workflow_jobs')
      .set({ status: 'running', updated_at: sql`NOW()` })
      .where('id', '=', job.id)
      .where('status', '=', 'queued')
      .execute();

    try {
      switch (job.workflow_type) {
        case 'escrow.auto_release':
          await this.handleEscrowAutoRelease(job.payload);
          break;
        case 'bank.sync':
          await this.handleBankSync(job.payload);
          break;
        default:
          break;
      }

      await db
        .updateTable('workflow_jobs')
        .set({ status: 'completed', completed_at: sql`NOW()`, updated_at: sql`NOW()` })
        .where('id', '=', job.id)
        .execute();
    } catch (error: any) {
      const attempts = Number(job.attempts ?? 0) + 1;
      const backoffMs = Math.min(60 * 60 * 1000, Math.pow(2, attempts) * 1000);
      const nextRun = new Date(Date.now() + backoffMs);
      const failed = attempts >= Number(job.max_attempts ?? 5);

      await db
        .updateTable('workflow_jobs')
        .set({
          status: failed ? 'failed' : 'queued',
          attempts,
          last_error: error?.message ?? 'Workflow failed',
          run_at: failed ? job.run_at : nextRun,
          updated_at: sql`NOW()`
        })
        .where('id', '=', job.id)
        .execute();
    }
  }

  private async handleEscrowAutoRelease(payload: Record<string, any>) {
    const transactionId = payload.transaction_id;
    if (!transactionId) return;

    const transaction = await db
      .selectFrom('escrow_transactions')
      .selectAll()
      .where('id', '=', transactionId)
      .executeTakeFirst();

    if (!transaction || transaction.status !== 'release_requested') {
      return;
    }

    const dispute = await db
      .selectFrom('escrow_disputes')
      .select(['id'])
      .where('escrow_transaction_id', '=', transactionId)
      .where('status', '=', 'open')
      .executeTakeFirst();

    if (dispute) {
      return;
    }

    await db
      .updateTable('escrow_transactions')
      .set({ status: 'released', release_approved_at: new Date().toISOString() })
      .where('id', '=', transactionId)
      .execute();

    await db
      .updateTable('escrow_accounts')
      .set({
        total_held_cents: sql`GREATEST(total_held_cents - ${transaction.amount_cents}, 0)`,
        total_released_cents: sql`total_released_cents + ${transaction.amount_cents}`
      })
      .where('id', '=', transaction.escrow_account_id)
      .execute();

    if (payload.milestone_id) {
      await db
        .updateTable('escrow_milestones')
        .set({ status: 'released', released_at: new Date().toISOString() })
        .where('id', '=', payload.milestone_id)
        .execute();
    }

    if (payload.invoice_id) {
      await db.insertInto('invoice_activities').values({
        invoice_id: payload.invoice_id,
        activity_type: 'status_changed',
        description: 'Escrow auto-released',
        performed_by_user_id: null,
        metadata: { workflow: 'escrow.auto_release' }
      }).execute();
    }

    const escrowEvent: BaseEvent = {
      event_id: crypto.randomUUID(),
      event_type: 'escrow.released',
      source_service: 'part4-integration',
      organization_id: payload.organization_id,
      timestamp: new Date().toISOString(),
      version: '1',
      payload: {
        transaction_id: transactionId,
        amount_cents: transaction.amount_cents,
        auto_released: true
      }
    };
    await this.eventBus.publish(escrowEvent);
  }

  private async handleBankSync(payload: Record<string, any>) {
    if (!payload.connection_id || !payload.organization_id) return;
    const syncEvent: BaseEvent = {
      event_id: crypto.randomUUID(),
      event_type: 'bank.sync_execute',
      source_service: 'part4-integration',
      organization_id: payload.organization_id,
      timestamp: new Date().toISOString(),
      version: '1',
      payload: {
        connection_id: payload.connection_id,
        organization_id: payload.organization_id
      }
    };
    await this.eventBus.publish(syncEvent);
  }

  private async processQuarterlyTaxRecap() {
    const now = new Date();
    const month = now.getUTCMonth() + 1;
    const day = now.getUTCDate();
    const isQuarterEnd =
      (month === 3 && day === 31) ||
      (month === 6 && day === 30) ||
      (month === 9 && day === 30) ||
      (month === 12 && day === 31);

    if (!isQuarterEnd) return;

    const year = now.getUTCFullYear();
    const quarter = Math.ceil(month / 3);
    const periodStartMonth = (quarter - 1) * 3 + 1;
    const periodStart = new Date(Date.UTC(year, periodStartMonth - 1, 1));
    const periodEnd = new Date(Date.UTC(year, periodStartMonth + 2, 0));

    const organizations = await db.selectFrom('organizations').select(['id']).execute();

    for (const org of organizations) {
      const existing = await db
        .selectFrom('ledger_period_locks')
        .select(['id'])
        .where('organization_id', '=', org.id)
        .where('period_start', '=', periodStart.toISOString().split('T')[0])
        .where('period_end', '=', periodEnd.toISOString().split('T')[0])
        .executeTakeFirst();

      if (existing) continue;

      const unreconciled = await db
        .selectFrom('ledger_entries')
        .select(sql<number>`count(*)`.as('count'))
        .where('organization_id', '=', org.id)
        .where('date', '>=', periodStart.toISOString().split('T')[0])
        .where('date', '<=', periodEnd.toISOString().split('T')[0])
        .where('reconciled', '=', false)
        .executeTakeFirst();

      const hasUnreconciled = Number(unreconciled?.count ?? 0) > 0;

      await db.insertInto('ledger_period_locks').values({
        organization_id: org.id,
        period_start: periodStart.toISOString().split('T')[0],
        period_end: periodEnd.toISOString().split('T')[0],
        status: hasUnreconciled ? 'blocked' : 'locked'
      }).execute();

      if (hasUnreconciled) {
        const blockedEvent: BaseEvent = {
          event_id: crypto.randomUUID(),
          event_type: 'tax.recap_blocked',
          source_service: 'part4-integration',
          organization_id: org.id,
          timestamp: new Date().toISOString(),
          version: '1',
          payload: {
            period_start: periodStart.toISOString().split('T')[0],
            period_end: periodEnd.toISOString().split('T')[0],
            reason: 'unreconciled_ledger'
          }
        };
        await this.eventBus.publish(blockedEvent);
      } else {
        const completedEvent: BaseEvent = {
          event_id: crypto.randomUUID(),
          event_type: 'tax.recap_completed',
          source_service: 'part4-integration',
          organization_id: org.id,
          timestamp: new Date().toISOString(),
          version: '1',
          payload: {
            period_start: periodStart.toISOString().split('T')[0],
            period_end: periodEnd.toISOString().split('T')[0]
          }
        };
        await this.eventBus.publish(completedEvent);
      }
    }
  }
}
