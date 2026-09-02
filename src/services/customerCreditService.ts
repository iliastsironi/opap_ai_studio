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

export const INITIAL_DEMO_CUSTOMERS: Customer[] = [
  {
    id: 'cust_01',
    organization_id: 'org_opap_demo',
    store_id: 'store_opap_01',
    name: 'Γιώργος Παπαδόπουλος',
    phone: '697 123 4567',
    tier: 'A',
    current_debt: 120.00,
    total_granted: 850.00,
    total_collected: 730.00,
    notes: 'Συνεπής πελάτης ΚΙΝΟ & Στοίχημα. Εξοφλεί κάθε Παρασκευή.',
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cust_02',
    organization_id: 'org_opap_demo',
    store_id: 'store_opap_01',
    name: 'Νίκος Καραγιάννης',
    phone: '698 998 8776',
    tier: 'A+',
    current_debt: 350.00,
    total_granted: 3200.00,
    total_collected: 2850.00,
    notes: 'VIP Πελάτης VLTs & Στοίχημα. Άμεση εξόφληση μέσω e-banking.',
    status: 'VIP',
    created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cust_03',
    organization_id: 'org_opap_demo',
    store_id: 'store_opap_01',
    name: 'Κώστας Μανωλάς',
    phone: '694 556 6778',
    tier: 'B',
    current_debt: 60.00,
    total_granted: 400.00,
    total_collected: 340.00,
    notes: 'Όριο έως 100€. Παίζει Joker & Virtuals.',
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cust_04',
    organization_id: 'org_opap_demo',
    store_id: 'store_opap_01',
    name: 'Δημήτρης Σταυρόπουλος',
    phone: '693 112 2334',
    tier: 'C',
    current_debt: 25.00,
    total_granted: 150.00,
    total_collected: 125.00,
    notes: 'Αυστηρό όριο 30€. Συχνά καθυστερεί την εξόφληση.',
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cust_05',
    organization_id: 'org_opap_demo',
    store_id: 'store_opap_01',
    name: 'Βασίλης Αλεξίου',
    phone: '698 000 1122',
    tier: 'A',
    current_debt: 0.00,
    total_granted: 900.00,
    total_collected: 900.00,
    notes: 'Μηδενικό υπόλοιπο. Εξαιρετική πιστοληπτική εικόνα.',
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 45 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'cust_06',
    organization_id: 'org_opap_demo',
    store_id: 'store_opap_01',
    name: 'Αλέξανδρος Μιχαηλίδης',
    phone: '695 667 7889',
    tier: 'B',
    current_debt: 90.00,
    total_granted: 520.00,
    total_collected: 430.00,
    notes: 'Πλησιάζει το όριο των 100€ (υπόλοιπο διαθέσιμο: 10€).',
    status: 'ACTIVE',
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    updated_at: new Date().toISOString(),
  },
];

const CUSTOMER_STORAGE_KEY = 'shiftledger_customer_directory_v2';
const TIER_CONFIG_STORAGE_KEY = 'shiftledger_credit_tier_config_v2';

/**
 * Loads credit tier configurations for a given store (or defaults)
 */
export function getStoreCreditTierConfigs(storeId?: string): Record<CreditScoreTier, CreditTierConfig> {
  try {
    if (typeof window === 'undefined') return DEFAULT_CREDIT_TIER_CONFIGS;
    const key = storeId ? `${TIER_CONFIG_STORAGE_KEY}_${storeId}` : TIER_CONFIG_STORAGE_KEY;
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...DEFAULT_CREDIT_TIER_CONFIGS,
        ...parsed,
      };
    }
  } catch (e) {
    console.warn('Failed to load credit tier configs', e);
  }
  return DEFAULT_CREDIT_TIER_CONFIGS;
}

/**
 * Saves customized credit tier configurations (by owner/manager)
 */
export function saveStoreCreditTierConfigs(
  storeId: string,
  configs: Record<CreditScoreTier, CreditTierConfig>
): void {
  try {
    if (typeof window === 'undefined') return;
    const key = storeId ? `${TIER_CONFIG_STORAGE_KEY}_${storeId}` : TIER_CONFIG_STORAGE_KEY;
    localStorage.setItem(key, JSON.stringify(configs));
  } catch (e) {
    console.warn('Failed to save credit tier configs', e);
  }
}

/**
 * Gets all customers for the current store or organization
 */
export function getCustomers(storeId?: string): Customer[] {
  try {
    if (typeof window === 'undefined') return INITIAL_DEMO_CUSTOMERS;
    const raw = localStorage.getItem(CUSTOMER_STORAGE_KEY);
    if (raw) {
      const list: Customer[] = JSON.parse(raw);
      if (Array.isArray(list) && list.length > 0) {
        if (!storeId) return list;
        // Return store customers + generic org customers
        return list.filter((c) => !c.store_id || c.store_id === storeId || c.store_id === 'all');
      }
    }
    // Initialize with demo customers if empty
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_CUSTOMERS));
    return INITIAL_DEMO_CUSTOMERS;
  } catch (e) {
    console.warn('Failed to load customers from storage', e);
    return INITIAL_DEMO_CUSTOMERS;
  }
}

/**
 * Finds customer by ID or Name
 */
export function findCustomer(idOrName: string, storeId?: string): Customer | undefined {
  const all = getCustomers(storeId);
  const search = idOrName.trim().toLowerCase();
  return all.find(
    (c) => c.id === idOrName || c.name.toLowerCase() === search || (c.phone && c.phone.includes(search))
  );
}

/**
 * Creates or updates a customer in directory
 */
export function saveCustomer(customerData: Partial<Customer> & { name: string; tier: CreditScoreTier }): Customer {
  const all = getCustomers();
  const existingIdx = all.findIndex((c) => c.id === customerData.id || c.name.toLowerCase() === customerData.name.trim().toLowerCase());

  let updatedCustomer: Customer;

  if (existingIdx >= 0) {
    updatedCustomer = {
      ...all[existingIdx],
      ...customerData,
      name: customerData.name.trim(),
      updated_at: new Date().toISOString(),
    };
    all[existingIdx] = updatedCustomer;
  } else {
    updatedCustomer = {
      id: customerData.id || `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      organization_id: customerData.organization_id || 'org_opap_demo',
      store_id: customerData.store_id || 'store_opap_01',
      name: customerData.name.trim(),
      phone: customerData.phone || '',
      tier: customerData.tier || 'B',
      custom_limit: customerData.custom_limit ?? null,
      current_debt: customerData.current_debt || 0,
      total_granted: customerData.total_granted || 0,
      total_collected: customerData.total_collected || 0,
      notes: customerData.notes || '',
      status: customerData.status || (customerData.tier === 'A+' ? 'VIP' : 'ACTIVE'),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    all.push(updatedCustomer);
  }

  try {
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(all));
  } catch (e) {
    console.warn('Failed to persist customer', e);
  }

  return updatedCustomer;
}

/**
 * Deletes a customer from directory
 */
export function deleteCustomer(id: string): boolean {
  try {
    const all = getCustomers();
    const filtered = all.filter((c) => c.id !== id);
    localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(filtered));
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
  tierConfigs = getStoreCreditTierConfigs(customer.store_id)
): { limit: number; isUnlimited: boolean; tierConfig: CreditTierConfig } {
  const tierConfig = tierConfigs[customer.tier] || DEFAULT_CREDIT_TIER_CONFIGS[customer.tier] || DEFAULT_CREDIT_TIER_CONFIGS['B'];

  if (customer.custom_limit !== undefined && customer.custom_limit !== null && customer.custom_limit >= 0) {
    return {
      limit: customer.custom_limit,
      isUnlimited: false,
      tierConfig,
    };
  }

  return {
    limit: tierConfig.defaultLimit,
    isUnlimited: tierConfig.isUnlimited,
    tierConfig,
  };
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
 * Validates whether a customer can receive a new credit amount
 * according to their Credit Score and current unpaid balance
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
 * Applies shift credit transactions (GRANTED / COLLECTED) to update customer outstanding balances
 */
export function applyShiftCustomerCredits(
  credits: Partial<CustomerCredit>[],
  storeId?: string
): void {
  if (!Array.isArray(credits) || credits.length === 0) return;

  const customers = getCustomers(storeId);
  let changed = false;

  for (const cred of credits) {
    if (!cred.customer_name || !cred.amount || cred.amount <= 0) continue;

    let customer = customers.find(
      (c) => (cred.customer_id && c.id === cred.customer_id) || c.name.toLowerCase() === cred.customer_name?.trim().toLowerCase()
    );

    if (!customer) {
      // Auto-register new customer in tier B
      customer = {
        id: `cust_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        organization_id: cred.organization_id || 'org_opap_demo',
        store_id: storeId || cred.store_id || 'store_opap_01',
        name: cred.customer_name.trim(),
        tier: cred.customer_tier || 'B',
        current_debt: 0,
        total_granted: 0,
        total_collected: 0,
        status: 'ACTIVE',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      customers.push(customer);
    }

    if (cred.type === 'GRANTED') {
      customer.current_debt = Math.max(0, (customer.current_debt || 0) + cred.amount);
      customer.total_granted = (customer.total_granted || 0) + cred.amount;
    } else if (cred.type === 'COLLECTED') {
      customer.current_debt = Math.max(0, (customer.current_debt || 0) - cred.amount);
      customer.total_collected = (customer.total_collected || 0) + cred.amount;
    }
    customer.updated_at = new Date().toISOString();
    changed = true;
  }

  if (changed) {
    try {
      localStorage.setItem(CUSTOMER_STORAGE_KEY, JSON.stringify(customers));
    } catch (e) {
      console.warn('Failed to sync customer credit updates', e);
    }
  }
}
