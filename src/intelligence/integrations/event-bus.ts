import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { Redis } from 'ioredis';
import { config } from '../config/index.js';

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

export interface PublishContext {
  organizationId?: string;
  userId?: string;
  correlationId?: string;
  version?: string;
}

const EVENT_CHANNELS = {
  INVOICE_EVENTS: 'events:invoice',
  PAYMENT_EVENTS: 'events:payment',
  CLIENT_EVENTS: 'events:client',
  ESCROW_EVENTS: 'events:escrow',
  EXPENSE_EVENTS: 'events:expense',
  BANK_EVENTS: 'events:bank',
  VENDOR_EVENTS: 'events:vendor',
  RECEIPT_EVENTS: 'events:receipt',
  REPORT_EVENTS: 'events:report',
  TAX_EVENTS: 'events:tax',
  INSIGHT_EVENTS: 'events:insight',
  FORECAST_EVENTS: 'events:forecast',
  USER_EVENTS: 'events:user',
  ORG_EVENTS: 'events:organization',
  BILLING_EVENTS: 'events:billing',
  NOTIFICATION_EVENTS: 'events:notification'
} as const;

class EventBus {
  private emitter = new EventEmitter();
  private redis?: Redis;
  private subscriber?: Redis;

  constructor() {
    if (config.eventBus.url) {
      this.redis = new Redis(config.eventBus.url);
      this.subscriber = this.redis.duplicate();
      const channels = Object.values(EVENT_CHANNELS);
      this.subscriber.subscribe(...channels).catch(() => undefined);
      this.subscriber.on('message', (_channel: string, message: string) => {
        try {
          const event = JSON.parse(message) as BaseEvent;
          this.emitter.emit(event.event_type, event);
        } catch {
          return;
        }
      });
    }
  }

  async publish(eventType: string, payload: Record<string, any>, context: PublishContext = {}): Promise<void> {
    const organizationId = context.organizationId || payload.organization_id || payload.organizationId || '';
    const event: BaseEvent = {
      event_id: crypto.randomUUID(),
      event_type: eventType,
      source_service: config.serviceName,
      organization_id: organizationId,
      user_id: context.userId || payload.user_id || payload.userId,
      timestamp: new Date().toISOString(),
      version: context.version || '1',
      correlation_id: context.correlationId,
      payload
    };

    this.emitter.emit(eventType, event);
    if (this.redis) {
      try {
        const channel = this.getChannelForEvent(eventType);
        await this.redis.publish(channel, JSON.stringify(event));
      } catch {
        return;
      }
    }
  }

  subscribe(eventType: string | string[], handler: (event: BaseEvent) => Promise<void> | void) {
    const types = Array.isArray(eventType) ? eventType : [eventType];
    for (const type of types) {
      this.emitter.on(type, handler);
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

export const eventBus = new EventBus();
