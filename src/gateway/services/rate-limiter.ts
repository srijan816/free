import { Redis } from 'ioredis';
import { RATE_LIMITS, SubscriptionPlan } from '../constants/index.js';
import { config } from '../config.js';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset_at: number;
  retry_after?: number;
}

const memoryWindows = new Map<string, { count: number; reset: number }>();

export class RateLimiterService {
  private redis?: Redis;

  constructor() {
    if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl);
    }
  }

  async checkLimit(
    organizationId: string,
    plan: SubscriptionPlan,
    window: 'minute' | 'hour' | 'day'
  ): Promise<RateLimitResult> {
    const limits = RATE_LIMITS[plan];
    const limit = this.getLimitForWindow(limits, window);
    const windowSeconds = this.getWindowSeconds(window);
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % windowSeconds);
    const windowEnd = windowStart + windowSeconds;

    if (!this.redis) {
      return this.checkLimitInMemory(organizationId, window, limit, windowEnd, now);
    }

    const key = `ratelimit:${organizationId}:${window}:${windowStart}`;
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds + 1);
    }

    if (count > limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        reset_at: windowEnd,
        retry_after: windowEnd - now
      };
    }

    return {
      allowed: true,
      limit,
      remaining: limit - count,
      reset_at: windowEnd
    };
  }

  async getRateLimitHeaders(organizationId: string, plan: SubscriptionPlan) {
    const minuteResult = await this.checkLimit(organizationId, plan, 'minute');
    return {
      'X-RateLimit-Limit': minuteResult.limit.toString(),
      'X-RateLimit-Remaining': minuteResult.remaining.toString(),
      'X-RateLimit-Reset': minuteResult.reset_at.toString()
    };
  }

  private checkLimitInMemory(
    organizationId: string,
    window: 'minute' | 'hour' | 'day',
    limit: number,
    windowEnd: number,
    now: number
  ): RateLimitResult {
    const key = `${organizationId}:${window}:${windowEnd}`;
    const record = memoryWindows.get(key);

    if (!record || record.reset !== windowEnd) {
      memoryWindows.set(key, { count: 1, reset: windowEnd });
      return {
        allowed: true,
        limit,
        remaining: limit - 1,
        reset_at: windowEnd
      };
    }

    record.count += 1;

    if (record.count > limit) {
      return {
        allowed: false,
        limit,
        remaining: 0,
        reset_at: windowEnd,
        retry_after: windowEnd - now
      };
    }

    return {
      allowed: true,
      limit,
      remaining: limit - record.count,
      reset_at: windowEnd
    };
  }

  private getLimitForWindow(
    limits: typeof RATE_LIMITS[SubscriptionPlan],
    window: 'minute' | 'hour' | 'day'
  ): number {
    switch (window) {
      case 'minute':
        return limits.requests_per_minute;
      case 'hour':
        return limits.requests_per_hour;
      case 'day':
        return limits.requests_per_day;
    }
  }

  private getWindowSeconds(window: 'minute' | 'hour' | 'day'): number {
    switch (window) {
      case 'minute':
        return 60;
      case 'hour':
        return 3600;
      case 'day':
        return 86400;
    }
  }
}
