import { config } from '../config.js';
import { ApiError, ERROR_CODES } from '../utils/errors.js';

export async function searchAll(query: string, options: { type?: string; limit?: number }, headers: Record<string, string>) {
  const limit = options.limit || 10;
  const results: any[] = [];
  const tasks: Promise<void>[] = [];

  if (!options.type || options.type === 'clients') {
    tasks.push(
      fetchJson(`${config.part1Url}/api/v1/clients`, { search: query, page: 1, per_page: limit }, headers, true).then(
        (resp) => {
          const items = resp?.data || [];
          results.push(
            ...items.map((c: any) => ({
              type: 'client',
              id: c.id,
              title: c.name,
              subtitle: c.email,
              url: `/clients/${c.id}`
            }))
          );
        }
      )
    );
  }

  if (!options.type || options.type === 'invoices') {
    tasks.push(
      fetchJson(`${config.part1Url}/api/v1/invoices`, { search: query, page: 1, per_page: limit }, headers, true).then(
        (resp) => {
          const items = resp?.data || [];
          results.push(
            ...items.map((i: any) => ({
              type: 'invoice',
              id: i.id,
              title: `Invoice ${i.invoice_number || ''}`.trim(),
              subtitle: `${i.client_name || ''}`.trim(),
              url: `/invoices/${i.id}`
            }))
          );
        }
      )
    );
  }

  if (!options.type || options.type === 'expenses') {
    tasks.push(
      fetchJson(`${config.part2Url}/api/v1/expenses`, { search: query, page: 1, per_page: limit }, headers, true).then(
        (resp) => {
          const items = resp?.data || [];
          results.push(
            ...items.map((e: any) => ({
              type: 'expense',
              id: e.id,
              title: e.description,
              subtitle: `${e.vendor_name || ''}`.trim(),
              url: `/expenses/${e.id}`
            }))
          );
        }
      )
    );
  }

  if (!options.type || options.type === 'vendors') {
    tasks.push(
      fetchJson(`${config.part2Url}/api/v1/vendors/search`, { q: query, limit }, headers, true).then((resp) => {
        const items = resp?.data || [];
        results.push(
          ...items.map((v: any) => ({
            type: 'vendor',
            id: v.id,
            title: v.name,
            subtitle: v.default_category_name || '',
            url: `/vendors/${v.id}`
          }))
        );
      })
    );
  }

  await Promise.all(tasks);

  return {
    query,
    results: results.slice(0, limit),
    total: results.length
  };
}

async function fetchJson(
  baseUrl: string,
  query: Record<string, any> | undefined,
  headers: Record<string, string>,
  allowFailure: boolean = false
) {
  const url = appendQuery(baseUrl, query);
  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (allowFailure) {
      return null;
    }
    throw new ApiError({
      code: ERROR_CODES.SERVICE_UNAVAILABLE,
      message: 'Upstream service unavailable',
      statusCode: response.status
    });
  }
  return response.json();
}

function appendQuery(url: string, query?: Record<string, any>) {
  if (!query || Object.keys(query).length === 0) return url;
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    searchParams.set(key, String(value));
  }
  const queryString = searchParams.toString();
  return queryString ? `${url}?${queryString}` : url;
}
