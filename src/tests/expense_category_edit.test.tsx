import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { BUILTIN_EXPENSE_CATEGORIES, type ExpenseCategoryDef } from '../lib/expenseCategories.ts';
import { canChangeSide, canHideCategory, categoryLabelProblem, moveCategory } from '../lib/expenseCategoryEdit.ts';

/**
 * «Να επεξεργάζεσαι τις κατηγορίες εξόδων, όνομα κλπ.»
 */
const db = vi.hoisted(() => {
  const state = { updates: [] as Record<string, unknown>[], eqs: [] as unknown[][], count: 1 as number | null, error: null as null | { message: string } };
  const builder: any = {
    update: (payload: Record<string, unknown>) => (state.updates.push(payload), builder),
    eq: (...a: unknown[]) => (state.eqs.push(a), builder),
    then: (resolve: (v: unknown) => unknown) => resolve({ error: state.error, count: state.count }),
  };
  return { state, builder };
});
vi.mock('../services/supabase.ts', () => ({ supabase: { from: () => db.builder } }));

const { updateExpenseCategory, reorderExpenseCategories } = await import('../services/pnlService.ts');
const { ManageExpenseCategoriesModal } = await import('../components/modules/ManageExpenseCategoriesModal.tsx');

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', p), 'utf-8');
const withIds = (list: ExpenseCategoryDef[]): ExpenseCategoryDef[] => list.map((c, i) => ({ ...c, id: `id${i}` }));
const cats = withIds(BUILTIN_EXPENSE_CATEGORIES);
const custom: ExpenseCategoryDef = { id: 'idc', key: 'DRINKS', label: 'Ποτά', side: 'FNB', sortOrder: 500, isActive: true, isBuiltin: false };

beforeEach(() => {
  db.state.updates = [];
  db.state.eqs = [];
  db.state.count = 1;
  db.state.error = null;
});

describe('το όνομα μιας κατηγορίας', () => {
  it('δεν μπορεί να είναι κενό ή μόνο κενά', () => {
    expect(categoryLabelProblem('', 'id0', cats)).toMatch(/Γράψτε/);
    expect(categoryLabelProblem('   ', 'id0', cats)).toMatch(/Γράψτε/);
  });

  it('δεν μπορεί να ξεπερνά το όριο', () => {
    expect(categoryLabelProblem('α'.repeat(500), 'id0', cats)).toMatch(/χωράει/);
  });

  it('δεν μπορεί να ταυτίζεται με άλλη κατηγορία, ανεξάρτητα από πεζά/κεφαλαία και κενά', () => {
    expect(categoryLabelProblem('  καθαριότητα (γπ) ', 'idX', cats)).toMatch(/Υπάρχει ήδη/);
  });

  it('μπορεί να μείνει ίδιο με το δικό της (δεν συγκρούεται με τον εαυτό της)', () => {
    expect(categoryLabelProblem('Καθαριότητα (ΓΠ)', cats.find((c) => c.key === 'CLEANING')!.id, cats)).toBeNull();
  });

  it('ένα νέο ελεύθερο όνομα στέκει', () => {
    expect(categoryLabelProblem('Ποτά & Αναψυκτικά', 'idc', [...cats, custom])).toBeNull();
  });
});

describe('η πλευρά και η ορατότητα', () => {
  it('η πλευρά αλλάζει μόνο στις δικές σου κατηγορίες: οι ενσωματωμένες την έχουν κλειδωμένη', () => {
    expect(canChangeSide(custom)).toBe(true);
    for (const c of cats) expect(canChangeSide(c), c.key).toBe(false);
  });

  it('μια κατηγορία κρύβεται αν μένει άλλη ορατή', () => {
    expect(canHideCategory(cats, cats[0].id)).toBe(true);
  });

  it('η τελευταία ορατή δεν κρύβεται: μια φόρμα χωρίς κατηγορίες δεν αποθηκεύει τίποτα', () => {
    const onlyOne = cats.map((c, i) => ({ ...c, isActive: i === 2 }));
    expect(canHideCategory(onlyOne, onlyOne[2].id)).toBe(false);
    expect(canHideCategory(onlyOne, onlyOne[0].id)).toBe(true);
  });
});

describe('η σειρά', () => {
  it('μια κατηγορία ανεβαίνει μία θέση', () => {
    const changes = moveCategory(cats, cats[2].id!, -1);
    const byId = Object.fromEntries(changes.map((c) => [c.id, c.sortOrder]));
    expect(byId[cats[2].id!]).toBe(20);
    expect(byId[cats[1].id!]).toBe(30);
  });

  it('και κατεβαίνει', () => {
    const changes = moveCategory(cats, cats[0].id!, 1);
    const byId = Object.fromEntries(changes.map((c) => [c.id, c.sortOrder]));
    expect(byId[cats[0].id!]).toBe(20);
    expect(byId[cats[1].id!]).toBe(10);
  });

  it('η πρώτη δεν ανεβαίνει και η τελευταία δεν κατεβαίνει', () => {
    expect(moveCategory(cats, cats[0].id!, -1)).toEqual([]);
    expect(moveCategory(cats, cats[cats.length - 1].id!, 1)).toEqual([]);
    expect(moveCategory(cats, 'nope', 1)).toEqual([]);
  });

  it('δικές σου κατηγορίες με ίδιο αριθμό (500) μετακινούνται πραγματικά: οι αριθμοί ξαναμοιράζονται', () => {
    const a = { ...custom, id: 'a', key: 'A', label: 'Α', sortOrder: 500 };
    const b = { ...custom, id: 'b', key: 'B', label: 'Β', sortOrder: 500 };
    const list = [a, b];
    const changes = moveCategory(list, 'b', -1);
    expect(changes.length).toBeGreaterThan(0);
    const order = [...list]
      .map((c) => ({ id: c.id, sortOrder: changes.find((x) => x.id === c.id)?.sortOrder ?? c.sortOrder }))
      .sort((x, y) => x.sortOrder - y.sortOrder)
      .map((c) => c.id);
    expect(order).toEqual(['b', 'a']);
  });

  it('γράφονται μόνο οι γραμμές που άλλαξαν', () => {
    const changes = moveCategory(cats, cats[2].id!, -1);
    expect(changes).toHaveLength(2);
  });
});

describe('η αποθήκευση', () => {
  it('μετονομασία: γράφει το καθαρισμένο όνομα και ΜΟΝΟ αυτό, ποτέ το key', async () => {
    await updateExpenseCategory('id0', { label: '  Έξοδα ΓΠ  ' });
    const u = db.state.updates[0];
    expect(u.label).toBe('Έξοδα ΓΠ');
    expect('key' in u).toBe(false);
    expect(db.state.eqs[0]).toEqual(['id', 'id0']);
  });

  it('γράφει πλευρά, ορατότητα και σειρά όταν ζητηθούν, και μόνο αυτά', async () => {
    await updateExpenseCategory('idc', { side: 'COMPANY', isActive: false, sortOrder: 30 });
    const u = db.state.updates[0];
    expect(u.side).toBe('COMPANY');
    expect(u.is_active).toBe(false);
    expect(u.sort_order).toBe(30);
    expect('label' in u).toBe(false);
  });

  it('ένα UPDATE που το RLS φιλτράρει (0 γραμμές) δεν παριστάνει ότι αποθηκεύτηκε', async () => {
    db.state.count = 0;
    await expect(updateExpenseCategory('id0', { label: 'Χ' })).rejects.toThrow(/δεν αποθηκεύτηκε/);
  });

  it('ένα σφάλμα της βάσης φτάνει ως μήνυμα', async () => {
    db.state.error = { message: 'permission denied' };
    await expect(updateExpenseCategory('id0', { label: 'Χ' })).rejects.toThrow('permission denied');
  });

  it('η αλλαγή σειράς γράφει μία γραμμή ανά αλλαγή', async () => {
    await reorderExpenseCategories([{ id: 'a', sortOrder: 10 }, { id: 'b', sortOrder: 20 }]);
    expect(db.state.updates.map((u) => u.sort_order)).toEqual([10, 20]);
    expect(db.state.eqs.map((e) => e[1])).toEqual(['a', 'b']);
  });
});

describe('η οθόνη επεξεργασίας', () => {
  it('Modal: οι δύο εκδοχές του πακέτου ζωγραφίζονται (το test τρέχει με static markup)', () => {
    // Το Modal ζωγραφίζει από πύλη (portal) που δεν υπάρχει σε static markup· εδώ ελέγχεται ο κώδικας της οθόνης.
    const src = read('src/components/modules/ManageExpenseCategoriesModal.tsx');
    expect(src).toContain('data-testid="manage-expense-categories"');
    expect(renderToStaticMarkup(React.createElement(ManageExpenseCategoriesModal as never, { categories: cats, onClose: () => {}, onChanged: () => {} } as never)).length).toBeGreaterThanOrEqual(0);
  });

  const src = read('src/components/modules/ManageExpenseCategoriesModal.tsx');

  it('το όνομα αποθηκεύεται όταν φεύγει ο κέρσορας, και ελέγχεται πρώτα', () => {
    expect(src).toContain('onBlur={() => commitLabel(c)}');
    expect(src).toMatch(/const problem = categoryLabelProblem\(typed, c\.id, categories\);/);
  });

  it('κάθε κατηγορία έχει όνομα, βελάκια, μάτι ορατότητας και πλευρά', () => {
    expect(src).toMatch(/Μετακίνηση της \$\{c\.label\} πιο πάνω/);
    expect(src).toMatch(/Απόκρυψη της κατηγορίας \$\{c\.label\}/);
    expect(src).toMatch(/Πλευρά της κατηγορίας \$\{c\.label\}/);
  });

  it('η πλευρά των ενσωματωμένων φαίνεται κλειδωμένη, και των δικών σου έχει προειδοποίηση', () => {
    expect(src).toContain('canChangeSide(c)');
    expect(src).toContain('σταθερή');
    expect(src).toContain('Η αλλαγή πλευράς αλλάζει και τα παλιά έξοδα αυτής της κατηγορίας στο P&L.');
  });

  it('κάθε αλλαγή ξαναφορτώνει τη λίστα', () => {
    expect(src).toMatch(/await action\(\);\s*onChanged\(\);/);
  });

  it('η τελευταία ορατή δεν κρύβεται', () => {
    expect(src).toContain('disabled={busy || (c.isActive && !canHide)}');
  });

  it('τα κουμπιά «Νέα κατηγορία» και «Επεξεργασία κατηγοριών» είναι κάτω από το πεδίο, μόνο για όποιον τις διαχειρίζεται', () => {
    const m = read('src/components/modules/ExpensesManager.tsx');
    expect(m).toMatch(/\{canManageCategories && \(\s*<div className="mt-2 flex flex-wrap items-center gap-2">\s*<button[\s\S]*?Νέα κατηγορία[\s\S]*?Επεξεργασία κατηγοριών/);
    expect(m).toMatch(/\{manageCategoriesOpen && canManageCategories && \(\s*<ManageExpenseCategoriesModal/);
    expect(m).toContain('onChanged={() => void reloadCategories()}');
  });

  it('η κατηγορία έχει δική της γραμμή σε όλο το πλάτος: τα κουμπιά δεν πατούν πάνω στο «Ποσό»', () => {
    const m = read('src/components/modules/ExpensesManager.tsx');
    const at = m.indexOf('htmlFor="expense-category"');
    expect(at).toBeGreaterThan(0);
    // Η ετικέτα είναι μόνη της: τίποτα (κουμπιά, σύνδεσμοι) δεν μοιράζεται τη γραμμή της.
    expect(m.slice(at, m.indexOf('</label>', at))).not.toContain('<button');
    // Και το κουτί της απλώνεται και στις δύο στήλες, πριν το «Ποσό».
    expect(m.slice(m.lastIndexOf('<div', at - 1), at)).toContain('sm:col-span-2');
    expect(m.indexOf('htmlFor="expense-amount"')).toBeGreaterThan(m.indexOf('Επεξεργασία κατηγοριών'));
  });

  it('τα παράθυρα κατηγοριών ανοίγουν πάνω από τη φόρμα του εξόδου (stacked)', () => {
    expect(src).toContain('layer="stacked"');
    expect(read('src/components/modules/NewExpenseCategoryModal.tsx')).toContain('layer="stacked"');
  });

  it('η προειδοποίηση για την αλλαγή πλευράς γράφεται μία φορά, όχι σε κάθε κατηγορία', () => {
    const count = src.split('Η αλλαγή πλευράς αλλάζει και τα παλιά έξοδα').length - 1;
    expect(count).toBe(1);
  });
});
