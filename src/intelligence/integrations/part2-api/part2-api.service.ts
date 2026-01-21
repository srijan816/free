import axios, { AxiosInstance } from 'axios';
import { config } from '../../config/index.js';

export class Part2ApiService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: config.integrations.part2Url,
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

  async getRecurringExpenses(organizationId: string): Promise<any[]> {
    return this.request('get', '/internal/recurring-expenses', organizationId);
  }

  async getCurrentBalances(organizationId: string): Promise<any> {
    return this.request('get', '/internal/bank-accounts/balances', organizationId);
  }

  async getTotalDeductionsForYear(organizationId: string, year: number): Promise<{ total_cents: number }> {
    return this.request('get', `/internal/aggregations/deductions/year/${year}`, organizationId);
  }
}
