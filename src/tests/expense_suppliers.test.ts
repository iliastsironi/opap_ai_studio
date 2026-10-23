import { describe, expect, it } from 'vitest';
import {
  presetsForCategory, suppliersForCategory, expenseCategoryOfSupplier, PRESET_SUPPLIERS,
} from '../lib/expenseSuppliers.ts';

describe('the supplier list follows the category', () => {
  it('offers the utilities, and only those, for a bill', () => {
    const values = presetsForCategory('UTILITIES').map((p) => p.value);
    expect(values).toContain('ΔΕΗ / Ηλεκτρικό Ρεύμα');
    expect(values).not.toContain('Προμηθευτής Καφέ & Ροφημάτων');
    expect(values).not.toContain('Καθαριστικά & Είδη Υγιεινής');
  });

  it('offers the kiosk suppliers for an FnB expense', () => {
    const values = presetsForCategory('EXPENSES_FNB').map((p) => p.value);
    expect(values).toEqual(['Προμηθευτής Καφέ & Ροφημάτων', 'Snacks & Είδη Κυλικείου']);
  });

  it('falls back to everything rather than an empty list', () => {
    // Nothing built in is filed under ΓΠ, and an empty dropdown is a dead end.
    expect(presetsForCategory('EXPENSES_GP')).toEqual(PRESET_SUPPLIERS);
    expect(presetsForCategory('ΑΓΝΩΣΤΟ')).toEqual(PRESET_SUPPLIERS);
  });
});

describe('the registered suppliers', () => {
  const register = [
    { id: 'a', category: 'BEVERAGES_FNB' },
    { id: 'b', category: 'UTILITIES' },
    { id: 'c', category: 'OTHER' },
    { id: 'd' },
  ];

  it('narrows to the category chosen', () => {
    expect(suppliersForCategory('UTILITIES', register).map((s) => s.id)).toEqual(['b', 'c', 'd']);
  });

  it('keeps an uncategorised supplier reachable from anywhere', () => {
    // We do not know it does not belong, and a supplier reachable from no
    // category at all would be worse than a slightly longer list.
    expect(suppliersForCategory('CLEANING', register).map((s) => s.id)).toEqual(['c', 'd']);
    expect(suppliersForCategory('EXPENSES_FNB', register).map((s) => s.id)).toEqual(['a', 'c', 'd']);
  });

  it('narrows strictly, even down to nothing', () => {
    // Falling back to the whole register turned «only this category» into
    // «all of them» on the categories that needed narrowing most. Nothing is
    // stranded: the built-in recipients are always offered and the field
    // takes anything typed by hand.
    const allFnb = [{ id: 'x', category: 'BEVERAGES_FNB' }];
    expect(suppliersForCategory('UTILITIES', allFnb)).toEqual([]);
  });

  it('translates only the categories that mean something', () => {
    expect(expenseCategoryOfSupplier('BEVERAGES_FNB')).toBe('EXPENSES_FNB');
    expect(expenseCategoryOfSupplier('OTHER')).toBeNull();
    expect(expenseCategoryOfSupplier(undefined)).toBeNull();
  });
});

import { EXPENSE_CATEGORY_KEYS } from '../lib/expenseSuppliers.ts';

describe('the categories the forms offer', () => {
  it('covers every one the expense rows list', () => {
    // The closing screen renders one suggestion list per key, so a category
    // missing here is a row whose list does not exist.
    expect(EXPENSE_CATEGORY_KEYS).toEqual([
      'EXPENSES_GP', 'EXPENSES_FNB', 'SUPPLIES', 'UTILITIES', 'CLEANING', 'MAINTENANCE', 'OTHER',
    ]);
  });

  it('gives each one something to suggest', () => {
    for (const key of EXPENSE_CATEGORY_KEYS) {
      expect(presetsForCategory(key).length).toBeGreaterThan(0);
    }
  });

  it('keeps an electricity bill away from the coffee supplier', () => {
    const register = [
      { id: 'coffee', name: 'Καφές ΑΕ', category: 'BEVERAGES_FNB' },
      { id: 'tech', name: 'Τερματικά ΟΠΑΠ', category: 'OPAP_SERVICES' },
    ];
    const forBill = [
      ...presetsForCategory('UTILITIES').map((p) => p.value),
      ...suppliersForCategory('UTILITIES', register).map((s) => s.name),
    ];
    expect(forBill).toContain('ΔΕΗ / Ηλεκτρικό Ρεύμα');
    expect(forBill).not.toContain('Καφές ΑΕ');
    expect(forBill).not.toContain('Τερματικά ΟΠΑΠ');
  });
});
