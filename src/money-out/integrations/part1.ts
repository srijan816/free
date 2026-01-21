import { config } from '../config.js';

export interface ClientSummary {
  id: string;
  name: string;
  email: string;
  company?: string;
}

async function safeFetch(url: string) {
  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

export async function getClients(organizationId: string): Promise<ClientSummary[]> {
  try {
    const data = await safeFetch(`${config.part1ApiUrl}/api/v1/clients?per_page=100`);
    if (!data?.success) return [];
    return data.data as ClientSummary[];
  } catch {
    return [];
  }
}

export async function getClient(organizationId: string, clientId: string): Promise<ClientSummary | null> {
  try {
    const data = await safeFetch(`${config.part1ApiUrl}/api/v1/clients/${clientId}`);
    if (!data?.success) return null;
    return data.data as ClientSummary;
  } catch {
    return null;
  }
}
