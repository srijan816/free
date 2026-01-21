import { db } from './index.js';

const DEFAULT_ORG_ID = '00000000-0000-0000-0000-000000000000';

const defaultCategories = [
  { id: '00000000-0000-0000-0000-000000000001', name: 'Services', type: 'income', tax_category: 'line_1', is_default: true, sort_order: 1 },
  { id: '00000000-0000-0000-0000-000000000002', name: 'Products', type: 'income', tax_category: 'line_1', is_default: false, sort_order: 2 },
  { id: '00000000-0000-0000-0000-000000000003', name: 'Other Income', type: 'income', tax_category: 'line_6', is_default: false, sort_order: 3 },
  { id: '00000000-0000-0000-0000-000000000010', name: 'Advertising', type: 'expense', tax_category: 'line_8', is_default: false, sort_order: 1 },
  { id: '00000000-0000-0000-0000-000000000011', name: 'Car & Truck', type: 'expense', tax_category: 'line_9', is_default: false, sort_order: 2 },
  { id: '00000000-0000-0000-0000-000000000012', name: 'Commissions & Fees', type: 'expense', tax_category: 'line_10', is_default: false, sort_order: 3 },
  { id: '00000000-0000-0000-0000-000000000013', name: 'Contract Labor', type: 'expense', tax_category: 'line_11', is_default: false, sort_order: 4 },
  { id: '00000000-0000-0000-0000-000000000014', name: 'Insurance', type: 'expense', tax_category: 'line_15', is_default: false, sort_order: 5 },
  { id: '00000000-0000-0000-0000-000000000015', name: 'Interest', type: 'expense', tax_category: 'line_16b', is_default: false, sort_order: 6 },
  { id: '00000000-0000-0000-0000-000000000016', name: 'Legal & Professional', type: 'expense', tax_category: 'line_17', is_default: false, sort_order: 7 },
  { id: '00000000-0000-0000-0000-000000000017', name: 'Office Expenses', type: 'expense', tax_category: 'line_18', is_default: true, sort_order: 8 },
  { id: '00000000-0000-0000-0000-000000000018', name: 'Rent', type: 'expense', tax_category: 'line_20b', is_default: false, sort_order: 9 },
  { id: '00000000-0000-0000-0000-000000000019', name: 'Repairs & Maintenance', type: 'expense', tax_category: 'line_21', is_default: false, sort_order: 10 },
  { id: '00000000-0000-0000-0000-000000000020', name: 'Supplies', type: 'expense', tax_category: 'line_22', is_default: false, sort_order: 11 },
  { id: '00000000-0000-0000-0000-000000000021', name: 'Taxes & Licenses', type: 'expense', tax_category: 'line_23', is_default: false, sort_order: 12 },
  { id: '00000000-0000-0000-0000-000000000022', name: 'Travel', type: 'expense', tax_category: 'line_24a', is_default: false, sort_order: 13 },
  { id: '00000000-0000-0000-0000-000000000023', name: 'Meals', type: 'expense', tax_category: 'line_24b', is_default: false, sort_order: 14, tax_deduction_percent: 50 },
  { id: '00000000-0000-0000-0000-000000000024', name: 'Utilities', type: 'expense', tax_category: 'line_25', is_default: false, sort_order: 15 },
  { id: '00000000-0000-0000-0000-000000000025', name: 'Software & Subscriptions', type: 'expense', tax_category: 'line_27', is_default: false, sort_order: 16 },
  { id: '00000000-0000-0000-0000-000000000026', name: 'Education & Training', type: 'expense', tax_category: 'line_27', is_default: false, sort_order: 17 },
  { id: '00000000-0000-0000-0000-000000000027', name: 'Bank Fees', type: 'expense', tax_category: 'line_27', is_default: false, sort_order: 18 },
  { id: '00000000-0000-0000-0000-000000000028', name: 'Other Expenses', type: 'expense', tax_category: 'line_27', is_default: false, sort_order: 99 }
];

const defaultFeatureFlags = [
  { name: 'ai_insights', description: 'AI insights beta', enabled_globally: false, rollout_percentage: 0 },
  { name: 'multi_currency', description: 'Multi-currency support', enabled_globally: true, rollout_percentage: 0 },
  { name: 'scheduled_reports', description: 'Scheduled reports', enabled_globally: true, rollout_percentage: 0 }
];

export async function runSeeds() {
  await db
    .insertInto('categories')
    .values(
      defaultCategories.map((category) => ({
        ...category,
        organization_id: DEFAULT_ORG_ID,
        is_system: true
      }))
    )
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();

  await db
    .insertInto('feature_flags')
    .values(defaultFeatureFlags)
    .onConflict((oc) => oc.column('name').doNothing())
    .execute();
}

if (process.argv[1]?.includes('seed')) {
  runSeeds()
    .then(() => {
      console.log('Seeds applied');
      process.exit(0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}
