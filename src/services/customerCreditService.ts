import { supabase } from './supabase.ts';
import { Customer, CreditScoreTier, CreditTierConfig, CustomerCredit } from '../types/index.ts';

export const DEFAULT_CREDIT_TIER_CONFIGS: Record<CreditScoreTier, CreditTierConfig> = {
  'A+': {
    tier: 'A+',
    label: 'A+ (VIP / Απεριόριστο)',
    defaultLimit: 999999,
    isUnlimited: true,
    description: 'VIP Πελάτες με άριστη αξιοπιστία - Χωρίς ανώτατο όριο πίστωσης.',
    badgeBg: 'bg-purple-100 text-purple-800',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-300',
  },
  'A': {
    tier: 'A',
    label: 'A (Υψηλή Εμπιστοσύνη)',
    defaultLimit: 300,
    isUnlimited: false,
    description: 'Τακτικοί πελάτες με συνεπείς εξοφλήσεις - Όριο έως 300€.',
    badgeBg: 'bg-emerald-100 text-emerald-800',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-300',
  },
  'B': {
    tier: 'B',
    label: 'B (Βασικό Όριο)',
    defaultLimit: 100,
    isUnlimited: false,
    description: 'Περιστασιακοί πελάτες ή μεσαία πιστοληπτική ικανότητα - Όριο έως 100€.',
    badgeBg: 'bg-amber-100 text-amber-800',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-300',
  },
  'C': {
    tier: 'C',
    label: 'C (Αυστηρό / Περιορισμένο)',
    defaultLimit: 30,
    isUnlimited: false,
    description: 'Νέοι ή επισφαλείς πελάτες - Αυστηρό όριο έως 30€ (απαιτείται πλήρης εξόφληση).',
    badgeBg: 'bg-rose-100 text-rose-800',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-300',
  },
};

// ----------------------------------------------------------------
// Credit tier configs: real table (credit_tier_configs), not localStorage.
// ----------------------------------------------------------------
export async function getStoreCreditTierConfigs(
  orgId: string,
  storeId?: string
): Promise<Record<CreditScoreTier, CreditTierConfig>> {
  try {
    let q = supabase.from('credit_tier_configs').select('*').eq('organization_id', orgId);
    q = storeId ? q.eq('store_id', storeId) : q.is('store_id', null);
    const { data, error } = await q;
    if (error) throw error;
    if (!data || data.length === 0) return DEFAULT_CREDIT_TIER_CONFIGS;
    const merged = { ...DEFAULT_CREDIT_TIER_CONFIGS };
    for (const row of data) {
      merged[row.tier as CreditScoreTier] = {
        tier: row.tier, label: row.label, defaultLimit: Number(row.default_limit) || 0,
        isUnlimited: row.is_unlimited, description: row.description,
        badgeBg: row.badge_bg, badgeText: row.badge_text, badgeBorder: row.badge_border,
      };
    }
    return merged;
  } catch (e) {
    console.warn('Failed to load credit tier configs', e);
    return DEFAULT_CREDIT_TIER_CONFIGS;
  }
}

export async function saveStoreCreditTierConfigs(
  orgId: string,
  storeId: string | undefined,
  configs: Record<CreditScoreTier, CreditTierConfig>
): Promise<void> {
  try {
    const rows = Object.values(configs).map((c) => ({
      organization_id: orgId, store_id: storeId || null, tier: c.tier, label: c.label,
      default_limit: c.defaultLimit, is_unlimited: c.isUnlimited, description: c.description,
      badge_bg: c.badgeBg, badge_text: c.badgeText, badge_border: c.badgeBorder,
    }));
    const { error } = await supabase.from('credit_tier_configs').upsert(rows, { onConflict: 'organization_id,store_id,tier' });
    if (error) throw error;
  } catch (e) {
    console.warn('Failed to save credit tier configs', e);
  }
}

// ----------------------------------------------------------------
// Customers: real table, not localStorage - fixes the app's previous
// zero-cross-device-sync running balance.
// ----------------------------------------------------------------
export async function getCustomers(orgId: string, storeId?: string): Promise<Customer[]> {
  try {
    let q = supabase.from('customers').select('*').eq('organization_id', orgId);
    if (storeId) q = q.eq('store_id', storeId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as Customer[];
  } catch (e) {
    console.warn('Failed to load customers', e);
    return [];
  }
}

export async function findCustomer(orgId: string, idOrName: string, storeId?: string): Promise<Customer | undefined> {
  const all = await getCustomers(orgId, storeId);
  const search = idOrName.trim().toLowerCase();
  return all.find(
    (c) => c.id === idOrName || c.name.toLowerCase() === search || (c.phone && c.phone.includes(search))
  );
}

export async function saveCustomer(customerData: Partial<Customer> & { organization_id: string; store_id: string; name: string; tier: CreditScoreTier }): Promise<Customer> {
  const payload: any = {
    id: customerData.id,
    organization_id: customerData.organization_id,
    store_id: customerData.store_id,
    name: customerData.name.trim(),
    phone: customerData.phone || null,
    tier: customerData.tier,
    custom_limit: customerData.custom_limit ?? null,
    notes: customerData.notes || null,
    status: customerData.status || (customerData.tier === 'A+' ? 'VIP' : 'ACTIVE'),
    updated_at: new Date().toISOString(),
  };
  if (!payload.id) delete payload.id;
  const { data, error } = await supabase.from('customers').upsert(payload).select().single();
  if (error) throw error;
  return data as Customer;
}

/**
 * Records a manual balance correction as a real, trigger-applied transaction
 * (shift_id left null - not tied to any specific shift) instead of writing
 * customers.current_debt directly, so admin corrections stay in the same
 * audit trail as shift-driven credits/collections.
 */
export async function adjustCustomerDebt(params: {
  customerId: string;
  organizationId: string;
  storeId: string;
  currentDebt: number;
  desiredDebt: number;
  createdByUserId: string;
  customerName: string;
  customerTier: CreditScoreTier;
}): Promise<void> {
  const delta = params.desiredDebt - params.currentDebt;
  if (Math.abs(delta) < 0.005) return;
  const { error } = await supabase.from('customer_credit_transactions').insert({
    organization_id: params.organizationId,
    store_id: params.storeId,
    shift_id: null,
    customer_id: params.customerId,
    customer_name_snapshot: params.customerName,
    customer_tier_snapshot: params.customerTier,
    type: delta > 0 ? 'GRANTED' : 'COLLECTED',
    amount: Math.abs(delta),
    notes: 'Χειροκίνητη διόρθωση υπολοίπου',
    created_by_user_id: params.createdByUserId,
  });
  if (error) throw error;
}

export async function deleteCustomer(id: string): Promise<boolean> {
  try {
    const { error } = await supabase.from('customers').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Failed to delete customer', e);
    return false;
  }
}

/**
 * Returns the effective credit limit for a customer based on their Credit Score Tier
 */
export function getCustomerCreditLimit(
  customer: Customer,
  tierConfigs: Record<CreditScoreTier, CreditTierConfig> = DEFAULT_CREDIT_TIER_CONFIGS
): { limit: number; isUnlimited: boolean; tierConfig: CreditTierConfig } {
  const tierConfig = tierConfigs[customer.tier] || DEFAULT_CREDIT_TIER_CONFIGS[customer.tier] || DEFAULT_CREDIT_TIER_CONFIGS['B'];

  if (customer.custom_limit !== undefined && customer.custom_limit !== null && customer.custom_limit >= 0) {
    return { limit: customer.custom_limit, isUnlimited: false, tierConfig };
  }

  return { limit: tierConfig.defaultLimit, isUnlimited: tierConfig.isUnlimited, tierConfig };
}

export interface CreditValidationResult {
  allowed: boolean;
  isUnlimited: boolean;
  tier: CreditScoreTier;
  tierLabel: string;
  tierLimit: number;
  currentDebt: number;
  availableCredit: number;
  totalNewDebt: number;
  excessAmount: number;
  errorMessage?: string;
  warningMessage?: string;
}

/**
 * Validates whether a customer can receive a new credit amount according to
 * their Credit Score and current unpaid balance. Pure function, no I/O -
 * unchanged by the Supabase migration.
 */
export function validateCustomerCreditGrant(
  customer: Customer,
  requestedCreditAmount: number,
  tierConfigs?: Record<CreditScoreTier, CreditTierConfig>
): CreditValidationResult {
  const { limit, isUnlimited, tierConfig } = getCustomerCreditLimit(customer, tierConfigs);
  const currentDebt = customer.current_debt || 0;

  if (isUnlimited) {
    return {
      allowed: true,
      isUnlimited: true,
      tier: customer.tier,
      tierLabel: tierConfig.label,
      tierLimit: Infinity,
      currentDebt,
      availableCredit: Infinity,
      totalNewDebt: currentDebt + requestedCreditAmount,
      excessAmount: 0,
    };
  }

  const availableCredit = Math.max(0, limit - currentDebt);
  const totalNewDebt = currentDebt + requestedCreditAmount;
  const isAllowed = totalNewDebt <= limit;
  const excessAmount = Math.max(0, totalNewDebt - limit);

  let errorMessage: string | undefined;
  let warningMessage: string | undefined;

  if (!isAllowed) {
    errorMessage = `Υπέρβαση Ορίου Credit Score (${tierConfig.label})! Ο πελάτης οφείλει ήδη ${currentDebt.toFixed(2)} € (Όριο: ${limit.toFixed(2)} €). Μέγιστη νέα πίστωση: ${availableCredit.toFixed(2)} €. Απαιτείται εξόφληση ${excessAmount.toFixed(2)} € για να εγκριθεί το ποσό.`;
  } else if (availableCredit - requestedCreditAmount < 20 && availableCredit - requestedCreditAmount > 0) {
    warningMessage = `Προσοχή: Ο πελάτης πλησιάζει το ανώτατο όριο της Κατηγορίας ${customer.tier} (Υπολειπόμενο περιθώριο: ${(availableCredit - requestedCreditAmount).toFixed(2)} €).`;
  }

  return {
    allowed: isAllowed,
    isUnlimited: false,
    tier: customer.tier,
    tierLabel: tierConfig.label,
    tierLimit: limit,
    currentDebt,
    availableCredit,
    totalNewDebt,
    excessAmount,
    errorMessage,
    warningMessage,
  };
}

/**
 * Applies shift credit transactions (GRANTED / COLLECTED). Each one is now
 * a real row in customer_credit_transactions - the DB trigger
 * (apply_customer_credit_transaction, 0001_schema.sql) maintains the
 * customer's running balance, replacing the manual current_debt +/- math
 * this function used to do by hand against a localStorage array.
 */
export async function applyShiftCustomerCredits(
  credits: Partial<CustomerCredit>[],
  orgId: string,
  storeId: string,
  shiftId: string,
  createdByUserId: string
): Promise<void> {
  if (!Array.isArray(credits) || credits.length === 0) return;

  const customers = await getCustomers(orgId, storeId);

  for (const cred of credits) {
    if (!cred.customer_name || !cred.amount || cred.amount <= 0) continue;

    let customer = customers.find(
      (c) => (cred.customer_id && c.id === cred.customer_id) || c.name.toLowerCase() === cred.customer_name?.trim().toLowerCase()
    );

    if (!customer) {
      customer = await saveCustomer({
        organization_id: orgId,
        store_id: storeId,
        name: cred.customer_name.trim(),
        tier: cred.customer_tier || 'B',
      });
      customers.push(customer);
    }

    const { error } = await supabase.from('customer_credit_transactions').insert({
      organization_id: orgId,
      store_id: storeId,
      shift_id: shiftId,
      customer_id: customer.id,
      customer_name_snapshot: customer.name,
      customer_tier_snapshot: customer.tier,
      type: cred.type,
      amount: cred.amount,
      notes: cred.notes || null,
      created_by_user_id: createdByUserId,
    });
    if (error) console.warn('Failed to record customer credit transaction', error);
  }
}
