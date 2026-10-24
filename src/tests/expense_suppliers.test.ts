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

  it('offers nothing built in for a category that has none', () => {
    // It used to fall back to the whole list. That read as a sensible guard
    // against an empty dropdown, and it meant «Έξοδα ΓΠ» - the default on
    // every fresh row - showed every recipient there is. The registered
    // suppliers sit beside these and the field takes free text, so an empty
    // built-in list is not a dead end.
    expect(presetsForCategory('EXPENSES_GP')).toEqual([]);
    expect(presetsForCategory('ΑΓΝΩΣΤΟ')).toEqual([]);
    expect(PRESET_SUPPLIERS.length).toBeGreaterThan(0);
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

  it('files every built-in recipient under a category that exists', () => {
    // Not «every category has one» - ΓΠ and Λοιπά deliberately have none -
    // but no preset may hide under a key no form offers.
    for (const preset of PRESET_SUPPLIERS) {
      expect(EXPENSE_CATEGORY_KEYS).toContain(preset.category);
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

import { EXPENSE_CATEGORIES } from '../lib/expenseSuppliers.ts';

describe('one list of categories, for every screen', () => {
  it('is what the keys are derived from, so they cannot drift', () => {
    expect(EXPENSE_CATEGORIES.map((c) => c.value)).toEqual(EXPENSE_CATEGORY_KEYS);
  });

  it('labels every one of them', () => {
    for (const c of EXPENSE_CATEGORIES) {
      expect(c.label.trim().length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate keys or labels', () => {
    const values = EXPENSE_CATEGORIES.map((c) => c.value);
    const labels = EXPENSE_CATEGORIES.map((c) => c.label);
    expect(new Set(values).size).toBe(values.length);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('includes the kiosk category the P&L modal used to be missing', () => {
    expect(EXPENSE_CATEGORIES.map((c) => c.value)).toContain('EXPENSES_FNB');
  });
});

describe('the default category on a fresh row', () => {
  it('does not quietly offer every recipient there is', () => {
    // «Έξοδα ΓΠ» is the general bucket and nothing built in is filed under
    // it. Falling back to the whole list meant the commonest case never
    // filtered - which is what was reported as «δεν το έφτιαξες».
    expect(presetsForCategory('EXPENSES_GP')).toEqual([]);
  });

  it('still narrows the categories that have their own', () => {
    expect(presetsForCategory('EXPENSES_FNB').map((p) => p.value)).toEqual([
      'Προμηθευτής Καφέ & Ροφημάτων', 'Snacks & Είδη Κυλικείου',
    ]);
  });
});
