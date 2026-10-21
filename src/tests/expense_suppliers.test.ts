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

  it('shows the whole register rather than nothing', () => {
    const allFnb = [{ id: 'x', category: 'BEVERAGES_FNB' }];
    expect(suppliersForCategory('UTILITIES', allFnb)).toEqual(allFnb);
  });

  it('translates only the categories that mean something', () => {
    expect(expenseCategoryOfSupplier('BEVERAGES_FNB')).toBe('EXPENSES_FNB');
    expect(expenseCategoryOfSupplier('OTHER')).toBeNull();
    expect(expenseCategoryOfSupplier(undefined)).toBeNull();
  });
});
