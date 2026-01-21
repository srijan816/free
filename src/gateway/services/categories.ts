import { db } from '../db/index.js';

const defaultCategories = [
  { name: 'Services', type: 'income', tax_category: 'line_1', is_default: true, sort_order: 1 },
  { name: 'Products', type: 'income', tax_category: 'line_1', is_default: false, sort_order: 2 },
  { name: 'Other Income', type: 'income', tax_category: 'line_6', is_default: false, sort_order: 3 },
  { name: 'Advertising', type: 'expense', tax_category: 'line_8', is_default: false, sort_order: 1 },
  { name: 'Car & Truck', type: 'expense', tax_category: 'line_9', is_default: false, sort_order: 2 },
  { name: 'Commissions & Fees', type: 'expense', tax_category: 'line_10', is_default: false, sort_order: 3 },
  { name: 'Contract Labor', type: 'expense', tax_category: 'line_11', is_default: false, sort_order: 4 },
  { name: 'Insurance', type: 'expense', tax_category: 'line_15', is_default: false, sort_order: 5 },
  { name: 'Interest', type: 'expense', tax_category: 'line_16b', is_default: false, sort_order: 6 },
  { name: 'Legal & Professional', type: 'expense', tax_category: 'line_17', is_default: false, sort_order: 7 },
  { name: 'Office Expenses', type: 'expense', tax_category: 'line_18', is_default: true, sort_order: 8 },
  { name: 'Rent', type: 'expense', tax_category: 'line_20b', is_default: false, sort_order: 9 },
  { name: 'Repairs & Maintenance', type: 'expense', tax_category: 'line_21', is_default: false, sort_order: 10 },
  { name: 'Supplies', type: 'expense', tax_category: 'line_22', is_default: false, sort_order: 11 },
  { name: 'Taxes & Licenses', type: 'expense', tax_category: 'line_23', is_default: false, sort_order: 12 },
  { name: 'Travel', type: 'expense', tax_category: 'line_24a', is_default: false, sort_order: 13 },
  { name: 'Meals', type: 'expense', tax_category: 'line_24b', is_default: false, sort_order: 14, tax_deduction_percent: 50 },
  { name: 'Utilities', type: 'expense', tax_category: 'line_25', is_default: false, sort_order: 15 },
  { name: 'Software & Subscriptions', type: 'expense', tax_category: 'line_27', is_default: false, sort_order: 16 },
  { name: 'Education & Training', type: 'expense', tax_category: 'line_27', is_default: false, sort_order: 17 },
  { name: 'Bank Fees', type: 'expense', tax_category: 'line_27', is_default: false, sort_order: 18 },
  { name: 'Other Expenses', type: 'expense', tax_category: 'line_27', is_default: false, sort_order: 99 }
];

export async function createDefaultCategories(organizationId: string) {
  const now = new Date();
  const values = defaultCategories.map((category) => ({
    ...category,
    organization_id: organizationId,
    is_system: true,
    created_at: now,
    updated_at: now
  }));

  await db.insertInto('categories').values(values).execute();
}

export async function listCategories(organizationId: string) {
  return db
    .selectFrom('categories')
    .selectAll()
    .where('organization_id', '=', organizationId)
    .orderBy('type')
    .orderBy('sort_order')
    .execute();
}

export async function createCategory(organizationId: string, payload: Record<string, any>) {
  return db
    .insertInto('categories')
    .values({
      ...payload,
      organization_id: organizationId
    })
    .returningAll()
    .executeTakeFirst();
}
