import { config } from '../config/index.js';

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
  if (config.auth.internalApiKey) {
    headers['x-internal-key'] = config.auth.internalApiKey;
  }

  const result = await safeFetch(`${config.integrations.part4Url}/magic-links`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  return result?.data || result;
}
