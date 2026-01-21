import axios, { AxiosInstance } from 'axios';
import { config } from '../../config/index.js';

export class Part1ApiService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.integrations.part1Url,
      timeout: 5000
    });
  }

  private async request<T>(
    method: 'get' | 'post',
    path: string,
    organizationId: string,
    data?: unknown,
    params?: Record<string, unknown>
  ): Promise<T> {
    const response = await this.client.request({
      method,
      url: path,
      data,
      params,
      headers: {
        'x-organization-id': organizationId,
        'x-source': 'part3',
        'Content-Type': 'application/json'
      }
    });

    return response.data?.data ?? response.data;
  }

  async getOutstandingInvoices(organizationId: string): Promise<any[]> {
    return this.request('get', '/internal/invoices/outstanding', organizationId);
  }

  async getOverdueInvoices(organizationId: string): Promise<any[]> {
    return this.request('get', '/internal/invoices/overdue', organizationId);
  }

  async getRecurringSchedules(organizationId: string): Promise<any[]> {
    return this.request('get', '/internal/recurring-schedules', organizationId);
  }

  async getExpectedCollections(organizationId: string, horizonDays: number): Promise<any[]> {
    return this.request('get', '/internal/forecasts/collections', organizationId, undefined, {
      days: horizonDays
    });
  }

  async getGrossIncomeForYear(organizationId: string, year: number): Promise<number> {
    const result = await this.request<{ total_cents: number }>(
      'get',
      `/internal/aggregations/income/year/${year}`,
      organizationId
    );
    return result.total_cents;
  }
}
