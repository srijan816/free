import { EventEmitter } from 'node:events';
import { Redis } from 'ioredis';
import { config } from '../config.js';
import { EVENT_CHANNELS } from '../constants/index.js';

export interface BaseEvent {
  event_id: string;
  event_type: string;
  source_service: string;
  organization_id: string;
  user_id?: string;
  timestamp: string;
  version: string;
  correlation_id?: string;
  payload: Record<string, any>;
}

export interface EventSubscription {
  event_type: string | string[];
  handler: (event: BaseEvent) => Promise<void>;
}

export class EventBusService {
  private emitter = new EventEmitter();
  private redis?: Redis;
  private subscriber?: Redis;

  constructor() {
    if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl);
      this.subscriber = this.redis.duplicate();
      const channels = Object.values(EVENT_CHANNELS);
      this.subscriber.subscribe(...channels).catch(() => undefined);
      this.subscriber.on('message', (_channel, message) => {
        try {
          const event = JSON.parse(message) as BaseEvent;
          this.emitter.emit(event.event_type, event);
        } catch {
          return;
        }
      });
    }
  }

  async publish(event: BaseEvent): Promise<void> {
    this.emitter.emit(event.event_type, event);
    if (this.redis) {
      const channel = this.getChannelForEvent(event.event_type);
      await this.redis.publish(channel, JSON.stringify(event));
    }
  }

  subscribe(subscription: EventSubscription): void {
    const types = Array.isArray(subscription.event_type) ? subscription.event_type : [subscription.event_type];
    for (const type of types) {
      this.emitter.on(type, subscription.handler);
    }
  }

  private getChannelForEvent(eventType: string): string {
    const prefix = eventType.split('.')[0];
    const channelMap: Record<string, string> = {
      invoice: EVENT_CHANNELS.INVOICE_EVENTS,
      payment: EVENT_CHANNELS.PAYMENT_EVENTS,
      client: EVENT_CHANNELS.CLIENT_EVENTS,
      escrow: EVENT_CHANNELS.ESCROW_EVENTS,
      expense: EVENT_CHANNELS.EXPENSE_EVENTS,
      bank: EVENT_CHANNELS.BANK_EVENTS,
      vendor: EVENT_CHANNELS.VENDOR_EVENTS,
      receipt: EVENT_CHANNELS.RECEIPT_EVENTS,
      report: EVENT_CHANNELS.REPORT_EVENTS,
      tax: EVENT_CHANNELS.TAX_EVENTS,
      insight: EVENT_CHANNELS.INSIGHT_EVENTS,
      forecast: EVENT_CHANNELS.FORECAST_EVENTS,
      user: EVENT_CHANNELS.USER_EVENTS,
      organization: EVENT_CHANNELS.ORG_EVENTS,
      billing: EVENT_CHANNELS.BILLING_EVENTS,
      notification: EVENT_CHANNELS.NOTIFICATION_EVENTS
    };

    return channelMap[prefix] || 'events:general';
  }
}
