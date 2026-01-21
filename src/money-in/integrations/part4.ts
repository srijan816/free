import { config } from '../config.js';

async function safeFetch(url: string, options: RequestInit) {
  const response = await fetch(url, options);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(text || `Part4 request failed: ${response.status}`);
  }
  return text ? JSON.parse(text) : null;
}

export async function createMagicLink(payload: {
  organization_id: string;
  entity_type: string;
  entity_id: string;
  expires_in_days?: number;
  max_uses?: number;
  metadata?: Record<string, any>;
}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.internalApiKey) {
    headers['x-internal-key'] = config.internalApiKey;
  }

  const result = await safeFetch(`${config.part4ApiUrl}/api/v1/magic-links`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  return result?.data || result;
}

export async function resolveMagicLink(token: string) {
  const result = await safeFetch(`${config.part4ApiUrl}/api/v1/magic-links/${token}`, {
    method: 'GET'
  });

  return result?.data || result;
}
