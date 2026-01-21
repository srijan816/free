import { eventBus } from '../integrations/event-bus.js';
import { syncConnection } from '../services/banking.js';

export function registerEventConsumers() {
  eventBus.subscribe('bank.sync_execute', async (event) => {
    const payload = event.payload || {};
    if (!payload.organization_id || !payload.connection_id) return;
    await syncConnection(payload.organization_id, payload.connection_id);
  });
}
