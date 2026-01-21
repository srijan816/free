import { db } from '../db/index.js';
import { sql } from 'kysely';
import { config } from '../config.js';
import { Redis } from 'ioredis';
import { SERVICES } from '../constants/index.js';

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  duration_ms: number;
  message?: string;
  details?: Record<string, any>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  version: string;
  uptime_seconds: number;
  checks: HealthCheck[];
}

export class HealthService {
  private readonly startTime = Date.now();
  private readonly version = process.env.APP_VERSION || '1.0.0';
  private redis?: Redis;

  constructor() {
    if (config.redisUrl) {
      this.redis = new Redis(config.redisUrl);
    }
  }

  async check(): Promise<HealthStatus> {
    const checks: HealthCheck[] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMemory(),
      this.checkDiskSpace()
    ]);

    const status = determineOverallStatus(checks);

    return {
      status,
      timestamp: new Date().toISOString(),
      version: this.version,
      uptime_seconds: Math.floor((Date.now() - this.startTime) / 1000),
      checks
    };
  }

  async checkAllServices(): Promise<Record<string, HealthStatus>> {
    const services = {
      [SERVICES.PART1_MONEY_IN]: config.part1Url,
      [SERVICES.PART2_MONEY_OUT]: config.part2Url,
      [SERVICES.PART3_INTELLIGENCE]: config.part3Url
    } as Record<string, string>;

    const results: Record<string, HealthStatus> = {};

    for (const [name, url] of Object.entries(services)) {
      results[name] = await this.checkServiceHealth(name, url);
    }

    return results;
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const start = Date.now();
    try {
      await db.executeQuery(sql`select 1`.compile(db));
      return { name: 'database', status: 'pass', duration_ms: Date.now() - start };
    } catch (error: any) {
      return {
        name: 'database',
        status: 'fail',
        duration_ms: Date.now() - start,
        message: error.message
      };
    }
  }

  private async checkRedis(): Promise<HealthCheck> {
    const start = Date.now();
    if (!this.redis) {
      return { name: 'redis', status: 'warn', duration_ms: 0, message: 'Redis not configured' };
    }

    try {
      await this.redis.ping();
      return { name: 'redis', status: 'pass', duration_ms: Date.now() - start };
    } catch (error: any) {
      return {
        name: 'redis',
        status: 'fail',
        duration_ms: Date.now() - start,
        message: error.message
      };
    }
  }

  private async checkMemory(): Promise<HealthCheck> {
    const used = process.memoryUsage();
    const heapUsedMB = Math.round(used.heapUsed / 1024 / 1024);
    const heapTotalMB = Math.round(used.heapTotal / 1024 / 1024);
    const usagePercent = (used.heapUsed / used.heapTotal) * 100;

    return {
      name: 'memory',
      status: usagePercent > 90 ? 'warn' : 'pass',
      duration_ms: 0,
      details: {
        heap_used_mb: heapUsedMB,
        heap_total_mb: heapTotalMB,
        usage_percent: Math.round(usagePercent)
      }
    };
  }

  private async checkDiskSpace(): Promise<HealthCheck> {
    return { name: 'disk', status: 'pass', duration_ms: 0 };
  }

  private async checkServiceHealth(_name: string, baseUrl: string): Promise<HealthStatus> {
    const start = Date.now();
    try {
      const response = await fetch(`${baseUrl}/health`, { method: 'GET' });
      const data = await response.json();
      return data;
    } catch (error: any) {
      return {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        version: 'unknown',
        uptime_seconds: 0,
        checks: [
          {
            name: 'connection',
            status: 'fail',
            duration_ms: Date.now() - start,
            message: error.message
          }
        ]
      };
    }
  }
}

function determineOverallStatus(checks: HealthCheck[]): 'healthy' | 'degraded' | 'unhealthy' {
  const hasFailure = checks.some((check) => check.status === 'fail');
  const hasWarning = checks.some((check) => check.status === 'warn');

  if (hasFailure) return 'unhealthy';
  if (hasWarning) return 'degraded';
  return 'healthy';
}
