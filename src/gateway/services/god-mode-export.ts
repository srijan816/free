import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import AdmZip from 'adm-zip';
import { db } from '../db/index.js';

export async function createGodModeExport(params: {
  organizationId: string;
  passphrase: string;
  includeReceipts?: boolean;
}) {
  const organization = await db
    .selectFrom('organizations')
    .selectAll()
    .where('id', '=', params.organizationId)
    .executeTakeFirst();

  if (!organization) {
    throw new Error('Organization not found');
  }

  const [
    users,
    categories,
    ledgerEntries,
    clients,
    invoices,
    payments,
    expenses,
    receipts,
    bankAccounts,
    bankTransactions,
    vendors,
    insights,
    taxEstimates
  ] = await Promise.all([
    db.selectFrom('users').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('categories').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('ledger_entries').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('clients').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('invoices').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('payments').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('expenses').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('receipts').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('bank_accounts').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('bank_transactions').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('vendors').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('insights').selectAll().where('organization_id', '=', params.organizationId).execute(),
    db.selectFrom('tax_estimates').selectAll().where('organization_id', '=', params.organizationId).execute()
  ]);

  const exportPayload = {
    organization,
    users,
    categories,
    ledger_entries: ledgerEntries,
    clients,
    invoices,
    payments,
    expenses,
    receipts,
    bank_accounts: bankAccounts,
    bank_transactions: bankTransactions,
    vendors,
    insights,
    tax_estimates: taxEstimates,
    generated_at: new Date().toISOString()
  };

  const zip = new AdmZip();
  zip.addFile('data.json', Buffer.from(JSON.stringify(exportPayload, null, 2)));

  if (params.includeReceipts) {
    for (const receipt of receipts as any[]) {
      if (!receipt.file_url) continue;
      const filePath = receipt.file_url;
      if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
        continue;
      }

      try {
        const buffer = await fs.readFile(filePath);
        const safeName = `${receipt.id}_${path.basename(filePath)}`;
        zip.addFile(path.join('receipts', safeName), buffer);
      } catch {
        continue;
      }
    }
  }

  const zipBuffer = zip.toBuffer();
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(params.passphrase, salt, 32);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(zipBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    file_name: `god-mode-export-${params.organizationId}.zip.enc`,
    encrypted_base64: encrypted.toString('base64'),
    salt_base64: salt.toString('base64'),
    iv_base64: iv.toString('base64'),
    auth_tag_base64: authTag.toString('base64')
  };
}
