import { createNotification } from '../services/notifications.js';
import { EventBusService } from '../services/event-bus.js';
import { WorkflowSchedulerService } from '../services/workflow-scheduler.js';
import {
  handleExpenseCreated,
  handleExpenseDeleted,
  handleExpenseUpdated,
  handlePaymentCompleted,
  handlePaymentRefunded
} from '../services/ledger-consumer.js';

export function registerEventConsumers(eventBus: EventBusService, workflowScheduler: WorkflowSchedulerService) {
  eventBus.subscribe({ event_type: 'payment.completed', handler: handlePaymentCompleted });
  eventBus.subscribe({ event_type: 'payment.refunded', handler: handlePaymentRefunded });
  eventBus.subscribe({ event_type: 'expense.created', handler: handleExpenseCreated });
  eventBus.subscribe({ event_type: 'expense.updated', handler: handleExpenseUpdated });
  eventBus.subscribe({ event_type: 'expense.deleted', handler: handleExpenseDeleted });

  eventBus.subscribe({
    event_type: 'insight.created',
    handler: async (event) => {
    const payload = event.payload || {};
    if (payload.type !== 'anomaly') return;
    await createNotification({
      organization_id: event.organization_id,
      user_id: event.user_id ?? null,
      type: 'insight.anomaly',
      title: payload.title || 'Spending anomaly detected',
      message: payload.description || 'A spending anomaly was detected.',
      data: payload.data || {},
      action_url: payload.action_url ?? null,
      priority: 'high',
      channels: ['in_app', 'webhook']
    });
    }
  });

  eventBus.subscribe({
    event_type: 'escrow.release_requested',
    handler: async (event) => {
    const payload = event.payload || {};
    if (!payload.transaction_id || !payload.auto_release_date) return;
    await workflowScheduler.scheduleJob({
      workflow_type: 'escrow.auto_release',
      organization_id: event.organization_id,
      run_at: new Date(payload.auto_release_date),
      payload: {
        organization_id: event.organization_id,
        transaction_id: payload.transaction_id,
        escrow_account_id: payload.escrow_account_id,
        invoice_id: payload.invoice_id,
        milestone_id: payload.milestone_id
      },
      dedupe_key: `escrow:auto_release:${payload.transaction_id}`
    });
    }
  });

  eventBus.subscribe({
    event_type: 'escrow.disputed',
    handler: async (event) => {
    const payload = event.payload || {};
    if (!payload.transaction_id) return;
    await workflowScheduler.cancelJobByDedupeKey(`escrow:auto_release:${payload.transaction_id}`);
    }
  });

  eventBus.subscribe({
    event_type: 'bank.connected',
    handler: async (event) => {
    const payload = event.payload || {};
    if (!payload.connection_id) return;
    await workflowScheduler.scheduleJob({
      workflow_type: 'bank.sync',
      organization_id: event.organization_id,
      run_at: new Date(),
      payload: {
        connection_id: payload.connection_id,
        organization_id: event.organization_id
      },
      dedupe_key: `bank:sync:${payload.connection_id}`
    });
    }
  });

  eventBus.subscribe({
    event_type: 'bank.sync_completed',
    handler: async (event) => {
    const payload = event.payload || {};
    if (!payload.connection_id) return;
    const runAt = new Date(Date.now() + 6 * 60 * 60 * 1000);
    await workflowScheduler.scheduleJob({
      workflow_type: 'bank.sync',
      organization_id: event.organization_id,
      run_at: runAt,
      payload: {
        connection_id: payload.connection_id,
        organization_id: event.organization_id
      },
      dedupe_key: `bank:sync:${payload.connection_id}`
    });
    }
  });

  eventBus.subscribe({
    event_type: 'bank.sync_failed',
    handler: async (event) => {
    const payload = event.payload || {};
    if (!payload.connection_id) return;
    const delayMs = payload.retry_in_ms ? Number(payload.retry_in_ms) : 15 * 60 * 1000;
    const runAt = new Date(Date.now() + delayMs);
    await workflowScheduler.scheduleJob({
      workflow_type: 'bank.sync',
      organization_id: event.organization_id,
      run_at: runAt,
      payload: {
        connection_id: payload.connection_id,
        organization_id: event.organization_id
      },
      dedupe_key: `bank:sync:${payload.connection_id}`
    });
    }
  });
}
