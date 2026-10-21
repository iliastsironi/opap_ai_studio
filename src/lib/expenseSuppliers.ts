/**
 * Which suppliers belong to an expense category.
 *
 * The entry form asks for the category first and then offers a supplier list
 * that ignored it completely: every built-in utility, every cleaning
 * supplier, every FnB preset and the whole supplier register, in one
 * dropdown, for every category. Somebody entering an electricity bill
 * scrolled past the coffee supplier to get there.
 *
 * So the list narrows to the category chosen. Two rules keep it from hiding
 * what somebody needs:
 *
 *   - a supplier whose own category does not map to an expense category is
 *     shown everywhere. We do not know that it does not belong, and a
 *     supplier that cannot be reached from any category would be worse than
 *     a slightly long list;
 *   - if narrowing leaves nothing at all, the full list comes back. An empty
 *     dropdown is a dead end, not a filter.
 */

export type ExpenseCategory =
  | 'EXPENSES_GP'
  | 'EXPENSES_FNB'
  | 'SUPPLIES'
  | 'CLEANING'
  | 'MAINTENANCE'
  | 'UTILITIES'
  | 'OTHER';

export interface PresetSupplier {
  /** The value stored as the expense's recipient. */
  value: string;
  label: string;
  category: ExpenseCategory;
}

/** The built-in recipients, each under the category it is actually paid from. */
export const PRESET_SUPPLIERS: PresetSupplier[] = [
  { value: 'ΔΕΗ / Ηλεκτρικό Ρεύμα', label: 'ΔΕΗ / Ενέργεια (Ηλεκτρικό Ρεύμα)', category: 'UTILITIES' },
  { value: 'ΕΥΔΑΠ / Ύδρευση', label: 'ΕΥΔΑΠ (Ύδρευση / Αποχέτευση)', category: 'UTILITIES' },
  { value: 'Cosmote / ΟΤΕ (Τηλεπικοινωνίες)', label: 'Cosmote / OTE (Internet & Τηλεφωνία)', category: 'UTILITIES' },
  { value: 'Nova / Wind (Τηλεπικοινωνίες & TV)', label: 'Nova / Wind (Τηλεπικοινωνίες & TV)', category: 'UTILITIES' },
  { value: 'Καθαριστικά & Είδη Υγιεινής', label: 'Καθαριστικά & Είδη Υγιεινής (Super Market)', category: 'CLEANING' },
  { value: 'Χαρτικά, Ρολά POS & Τερματικών', label: 'Χαρτικά, Ρολά POS & Τερματικών (Βιβλιοπωλείο)', category: 'SUPPLIES' },
  { value: 'Προμηθευτής Καφέ & Ροφημάτων', label: 'Προμηθευτής Καφέ & Ροφημάτων (FnB)', category: 'EXPENSES_FNB' },
  { value: 'Snacks & Είδη Κυλικείου', label: 'Snacks & Είδη Κυλικείου (FnB)', category: 'EXPENSES_FNB' },
  { value: 'Τεχνικός Συντήρησης / Βλάβες', label: 'Τεχνικός Συντήρησης / Ηλεκτρολόγος / Ψυκτικός', category: 'MAINTENANCE' },
];

/**
 * A registered supplier's own category, translated.
 *
 * Null where the supplier's category says nothing about which expense
 * category it is paid from - OTHER, or a value we have not seen - and those
 * suppliers stay visible everywhere.
 */
export function expenseCategoryOfSupplier(supplierCategory: unknown): ExpenseCategory | null {
  switch (supplierCategory) {
    case 'BEVERAGES_FNB':
      return 'EXPENSES_FNB';
    case 'OPAP_SERVICES':
    case 'IT_EQUIPMENT':
      return 'EXPENSES_GP';
    case 'OFFICE_CONSUMABLES':
      return 'SUPPLIES';
    case 'CLEANING':
      return 'CLEANING';
    case 'UTILITIES':
      return 'UTILITIES';
    default:
      return null;
  }
}

export function presetsForCategory(category: string): PresetSupplier[] {
  const matching = PRESET_SUPPLIERS.filter((p) => p.category === category);
  return matching.length > 0 ? matching : PRESET_SUPPLIERS;
}

export interface RegisteredSupplier {
  id: string;
  category?: unknown;
}

export function suppliersForCategory<T extends RegisteredSupplier>(
  category: string,
  suppliers: T[]
): T[] {
  const matching = suppliers.filter((s) => {
    const own = expenseCategoryOfSupplier(s.category);
    return own === null || own === category;
  });
  // Every supplier is categorised and none of them this way: show them all
  // rather than an empty register.
  return matching.length > 0 ? matching : suppliers;
}
