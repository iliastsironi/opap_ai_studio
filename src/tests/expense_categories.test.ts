import { describe, it, expect } from 'vitest';
import {
  BUILTIN_EXPENSE_CATEGORIES,
  ExpenseCategoryDef,
  activeCategories,
  expenseCategoryKey,
  fnbCategoryKeys,
  isFnbCategory,
} from '../lib/expenseCategories.ts';
import { MonthlyPnlInput, PnlStore, computeMonthlyPnl } from '../lib/pnlEngine.ts';

const STORE: PnlStore = { id: 'store_1', code: '101499', name: 'Κατάστημα', storeType: 'OPAP_AGENCY' };

let seq = 0;
const expense = (category: string, amount: number) => ({
  id: `e${++seq}`,
  storeId: STORE.id,
  date: '2026-10-05',
  category,
  recipient: 'Προμηθευτής',
  amount,
});

const month = (expenses: ReturnType<typeof expense>[], categories?: ExpenseCategoryDef[]): MonthlyPnlInput => ({
  month: '2026-10',
  stores: [STORE],
  commissions: [],
  fixedCosts: [],
  payroll: [],
  companyCosts: [],
  companyDaily: [],
  expenses,
  shifts: [],
  // Μια πώληση καφέ, ώστε να υπάρχει πλευρά F&B να κοιτάξουμε.
  fnbManualDays: [{ storeId: STORE.id, day: '2026-10-05', cash: 500, pos: 0 }],
  vltCounts: [],
  expenseCategories: categories,
});

const custom = (key: string, side: 'AGENCY' | 'FNB'): ExpenseCategoryDef => ({
  key,
  label: key,
  side,
  sortOrder: 500,
  isActive: true,
  isBuiltin: false,
});

describe('κατηγορίες εξόδων που ορίζει ο ιδιοκτήτης', () => {
  it('μια δική του κατηγορία του καφέ χρεώνεται στον καφέ', () => {
    const categories = [...BUILTIN_EXPENSE_CATEGORIES, custom('CUSTOM_POTA', 'FNB')];
    const pnl = computeMonthlyPnl(month([expense('CUSTOM_POTA', 120)], categories));

    expect(pnl.fnb.dailyExpenses).toBeCloseTo(120, 2);
    expect(pnl.agency.dailyExpenses).toBeCloseTo(0, 2);
  });

  it('μια δική του κατηγορία του πρακτορείου ΔΕΝ γλιστράει στον καφέ', () => {
    // Αυτό είναι το λάθος που θα γινόταν από μόνο του: με τον παλιό κανόνα
    // «ό,τι δεν είναι EXPENSES_FNB πάει στο πρακτορείο», μια νέα κατηγορία
    // του καφέ θα χρεωνόταν σιωπηλά στο πρακτορείο. Τώρα το λέει η ίδια.
    const categories = [...BUILTIN_EXPENSE_CATEGORIES, custom('CUSTOM_GRAFIKI', 'AGENCY')];
    const pnl = computeMonthlyPnl(month([expense('CUSTOM_GRAFIKI', 80)], categories));

    expect(pnl.agency.dailyExpenses).toBeCloseTo(80, 2);
    expect(pnl.fnb.dailyExpenses).toBeCloseTo(0, 2);
  });

  it('οι δύο πλευρές εξακολουθούν να αθροίζουν στο σύνολο', () => {
    const categories = [
      ...BUILTIN_EXPENSE_CATEGORIES,
      custom('CUSTOM_POTA', 'FNB'),
      custom('CUSTOM_GRAFIKI', 'AGENCY'),
    ];
    const pnl = computeMonthlyPnl(
      month([expense('CUSTOM_POTA', 120), expense('CUSTOM_GRAFIKI', 80), expense('EXPENSES_GP', 40)], categories)
    );

    expect(pnl.agency.dailyExpenses + pnl.fnb.dailyExpenses).toBeCloseTo(240, 2);
    expect(pnl.storesTotal.dailyExpenses).toBeCloseTo(240, 2);
    expect(pnl.agencyNet + pnl.fnbNet).toBeCloseTo(pnl.netResult, 2);
  });

  it('χωρίς λίστα κατηγοριών κρατάει ό,τι ίσχυε πριν', () => {
    // Κάθε γραμμή γραμμένη πριν το 0074 δούλευε με μία και μόνη κατηγορία
    // καφέ. Ένας οργανισμός που δεν έχει ακόμη πίνακα δεν επιτρέπεται να
    // δει τα έξοδά του να αλλάζουν πλευρά.
    const pnl = computeMonthlyPnl(month([expense('EXPENSES_FNB', 70), expense('EXPENSES_GP', 30)]));

    expect(pnl.fnb.dailyExpenses).toBeCloseTo(70, 2);
    expect(pnl.agency.dailyExpenses).toBeCloseTo(30, 2);
  });

  it('η ερώτηση «είναι του καφέ;» έχει μία απάντηση', () => {
    const categories = [...BUILTIN_EXPENSE_CATEGORIES, custom('CUSTOM_POTA', 'FNB')];
    expect(isFnbCategory('CUSTOM_POTA', categories)).toBe(true);
    expect(isFnbCategory('EXPENSES_FNB', categories)).toBe(true);
    expect(isFnbCategory('EXPENSES_GP', categories)).toBe(false);
    // Κατηγορία που δεν υπάρχει πια στη λίστα: πέφτει στον ιστορικό κανόνα.
    expect(isFnbCategory('EXPENSES_FNB', [])).toBe(true);
    expect(isFnbCategory('XAMENI', categories)).toBe(false);

    expect(fnbCategoryKeys(categories).sort()).toEqual(['CUSTOM_POTA', 'EXPENSES_FNB']);
  });

  it('μια κατηγορία που αποσύρεται φεύγει από τις επιλογές, όχι από τα παλιά έξοδα', () => {
    const retired = { ...custom('CUSTOM_PALIA', 'FNB'), isActive: false };
    const categories = [...BUILTIN_EXPENSE_CATEGORIES, retired];

    expect(activeCategories(categories).some((c) => c.key === 'CUSTOM_PALIA')).toBe(false);
    // Αλλά ένα έξοδο γραμμένο με αυτήν εξακολουθεί να μετράει στον καφέ.
    const pnl = computeMonthlyPnl(month([expense('CUSTOM_PALIA', 55)], categories));
    expect(pnl.fnb.dailyExpenses).toBeCloseTo(55, 2);
  });

  it('το key βγαίνει λατινικό, σταθερό και μοναδικό', () => {
    expect(expenseCategoryKey('Ποτά & Αναψυκτικά')).toBe('CUSTOM_POTA_ANAPSYKTIKA');
    expect(expenseCategoryKey('Λογιστής')).toBe('CUSTOM_LOGISTIS');
    // Ίδιο όνομα δύο φορές - η φόρμα το εμποδίζει, μια αποσυρμένη όχι.
    const first = expenseCategoryKey('Ποτά');
    expect(expenseCategoryKey('Ποτά', [first])).not.toBe(first);
    // Το πρόθεμα κρατάει τις δικές του μακριά από μελλοντικές ενσωματωμένες.
    expect(expenseCategoryKey('Supplies')).toBe('CUSTOM_SUPPLIES');
    expect(BUILTIN_EXPENSE_CATEGORIES.every((c) => !c.key.startsWith('CUSTOM_'))).toBe(true);
  });
});
