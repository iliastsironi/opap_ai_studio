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
 *   - neither list falls back to «show them all» when a category has
 *     nothing of its own. That is what turned the filter back into the
 *     behaviour it was meant to replace, and on «Έξοδα ΓΠ» - the default on
 *     every fresh row - it meant the common case never filtered at all.
 */

export type ExpenseCategory =
  | 'EXPENSES_GP'
  | 'EXPENSES_FNB'
  | 'SUPPLIES'
  | 'CLEANING'
  | 'MAINTENANCE'
  | 'UTILITIES'
  | 'OTHER';

/**
 * The categories an expense can be filed under - one list, for every screen.
 *
 * There were three. The Έξοδα screen, the till's expense rows and the P&L
 * modal each had their own, with different labels for the same key («Χαρτί»
 * against «Χαρτί (ΓΠ)»), different order, and the P&L missing FnB
 * altogether. The same expense therefore read differently depending on where
 * you were standing.
 *
 * The «(ΓΠ)» suffix is kept because it says something true: those five are
 * sub-kinds of Γενικά Πληρωμών, which is why ΓΠ itself is the general bucket.
 */
export const EXPENSE_CATEGORIES: Array<{ value: ExpenseCategory; label: string }> = [
  { value: 'EXPENSES_GP', label: 'Έξοδα ΓΠ (Γενικά Πληρωμών)' },
  { value: 'EXPENSES_FNB', label: 'Έξοδα FnB (Κυλικείο)' },
  { value: 'SUPPLIES', label: 'Αναλώσιμα / Χαρτί (ΓΠ)' },
  { value: 'UTILITIES', label: 'Λογαριασμοί / ΔΕΗ (ΓΠ)' },
  { value: 'CLEANING', label: 'Καθαριότητα (ΓΠ)' },
  { value: 'MAINTENANCE', label: 'Συντήρηση / Βλάβες (ΓΠ)' },
  { value: 'OTHER', label: 'Λοιπά Έξοδα (ΓΠ)' },
];

export const EXPENSE_CATEGORY_KEYS: ExpenseCategory[] = EXPENSE_CATEGORIES.map((c) => c.value);

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
  // Since 0048 a supplier is filed under the same categories an expense is,
  // so most of this is now a pass-through.
  if (typeof supplierCategory === 'string'
      && (EXPENSE_CATEGORY_KEYS as string[]).includes(supplierCategory)
      && supplierCategory !== 'OTHER') {
    return supplierCategory as ExpenseCategory;
  }

  // The names suppliers used before it. Still read, because a row written by
  // a browser holding the previous bundle is still a supplier somebody needs
  // to find.
  switch (supplierCategory) {
    case 'BEVERAGES_FNB':
      return 'EXPENSES_FNB';
    case 'OPAP_SERVICES':
    case 'IT_EQUIPMENT':
      return 'EXPENSES_GP';
    case 'OFFICE_CONSUMABLES':
      return 'SUPPLIES';
    default:
      // OTHER, and anything unrecognised: says nothing about which category
      // pays this supplier, so they stay visible under all of them.
      return null;
  }
}

/**
 * Strictly the category's own, with no fallback.
 *
 * «Έξοδα ΓΠ» is the default on a fresh row and nothing built in is filed
 * under it, so falling back to the whole list meant the common case showed
 * every recipient there is - which is the behaviour being complained about,
 * reappearing through the back door. An empty suggestion list is not a dead
 * end here: the registered suppliers are offered beside these, and the field
 * takes anything typed by hand.
 */
/**
 * A supplier's category as one of today's, for an editor that has to put the
 * cursor somewhere.
 *
 * A row written before 0048 carries one of the old names, which no longer
 * appears in the list; opening it would otherwise leave the select on
 * whatever happened to be first and silently refile the supplier on save.
 */
export function normalizeSupplierCategory(supplierCategory: unknown): ExpenseCategory {
  if (typeof supplierCategory === 'string'
      && (EXPENSE_CATEGORY_KEYS as string[]).includes(supplierCategory)) {
    return supplierCategory as ExpenseCategory;
  }
  return expenseCategoryOfSupplier(supplierCategory) ?? 'OTHER';
}

export function presetsForCategory(category: string): PresetSupplier[] {
  return PRESET_SUPPLIERS.filter((p) => p.category === category);
}

export interface RegisteredSupplier {
  id: string;
  category?: unknown;
}

export function suppliersForCategory<T extends RegisteredSupplier>(
  category: string,
  suppliers: T[]
): T[] {
  // Strictly. An earlier version fell back to the whole register when
  // nothing matched, so «δείξε μόνο αυτούς της κατηγορίας» quietly became
  // «δείξε τους όλους» on exactly the categories that needed narrowing most.
  // Nothing is left stranded: a supplier with no meaningful category is
  // still shown everywhere by the rule above, the built-in recipients are
  // always offered, and both fields accept anything typed by hand.
  return suppliers.filter((s) => {
    const own = expenseCategoryOfSupplier(s.category);
    return own === null || own === category;
  });
}
