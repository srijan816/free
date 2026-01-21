import crypto from 'node:crypto';

export interface PlaidTransaction {
  transaction_id: string;
  amount: number;
  iso_currency_code?: string | null;
  date: string;
  authorized_date?: string | null;
  name: string;
  merchant_name?: string | null;
  original_description?: string | null;
  pending: boolean;
  category?: string[] | null;
  category_id?: string | null;
  payment_channel?: string | null;
  location?: {
    address?: string | null;
    city?: string | null;
    region?: string | null;
    postal_code?: string | null;
    country?: string | null;
    lat?: number | null;
    lon?: number | null;
  } | null;
}

export interface TransactionSyncResult {
  added: PlaidTransaction[];
  modified: PlaidTransaction[];
  removed: string[];
  has_more: boolean;
  next_cursor: string;
}

export interface PlaidLinkTokenResponse {
  link_token: string;
  expiration: string;
}

export interface PlaidService {
  createLinkToken(params: {
    organization_id: string;
    user_id: string;
    products: ('transactions' | 'auth' | 'identity')[];
  }): Promise<PlaidLinkTokenResponse>;
  exchangePublicToken(params: {
    public_token: string;
    organization_id: string;
    user_id: string;
  }): Promise<{
    access_token: string;
    item_id: string;
    institution_id: string;
    institution_name: string;
    institution_logo_url?: string;
    institution_color?: string;
    accounts: Array<{
      account_id: string;
      name: string;
      official_name?: string;
      type: string;
      subtype?: string;
      mask?: string;
      balances: {
        current?: number;
        available?: number;
        iso_currency_code?: string;
      };
    }>;
  }>;
  getAccounts(access_token: string): Promise<any[]>;
  syncTransactions(access_token: string, cursor?: string): Promise<TransactionSyncResult>;
  createUpdateLinkToken(item_id: string): Promise<{ link_token: string }>;
  removeConnection(access_token: string): Promise<void>;
}

class StubPlaidService implements PlaidService {
  async createLinkToken(): Promise<PlaidLinkTokenResponse> {
    return {
      link_token: `link-sandbox-${crypto.randomUUID()}`,
      expiration: new Date(Date.now() + 60 * 60 * 1000).toISOString()
    };
  }

  async exchangePublicToken(params: { public_token: string }): Promise<any> {
    return {
      access_token: `access-sandbox-${crypto.randomUUID()}`,
      item_id: `item-${crypto.randomUUID()}`,
      institution_id: 'ins_109508',
      institution_name: 'First Platypus Bank',
      institution_logo_url: undefined,
      institution_color: '#005BBB',
      accounts: [
        {
          account_id: `acc-${crypto.randomUUID()}`,
          name: 'Business Checking',
          official_name: 'Business Checking',
          type: 'depository',
          subtype: 'checking',
          mask: '1234',
          balances: { current: 1500, available: 1200, iso_currency_code: 'USD' }
        }
      ]
    };
  }

  async getAccounts(): Promise<any[]> {
    return [];
  }

  async syncTransactions(): Promise<TransactionSyncResult> {
    return {
      added: [],
      modified: [],
      removed: [],
      has_more: false,
      next_cursor: crypto.randomUUID()
    };
  }

  async createUpdateLinkToken(): Promise<{ link_token: string }> {
    return {
      link_token: `link-update-${crypto.randomUUID()}`
    };
  }

  async removeConnection(): Promise<void> {
    return;
  }
}

export const plaidService: PlaidService = new StubPlaidService();
