import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeMonthlyPnl,
  type MonthlyPnlInput,
  type PnlExpense,
  type PnlStore,
} from '../lib/pnlEngine';
import { splitShiftExpenses } from '../lib/expenseSplit';
import { storeHasCafe } from '../lib/storeTypeDefaults';
import { scopeRule, scopedUnits } from '../lib/reportScope';

/**
 * «Τα έξοδα που έχουν καταχωρηθεί στο Play όσον αφορά κάβα, καφέδες και λοιπά τα στέλνει στο FnB
 * στο P&L. Τα έξοδα του Play ως ανεξάρτητο μαγαζί πρέπει να είναι στο Play σε σύνολο, και να μη
 * φαίνονται στο FnB, που αφορά άλλο μαγαζί. Γενικά ο διαχωρισμός πρακτορείο και FnB να γίνεται
 * μόνο όταν ένα πρακτορείο έχει δηλωθεί ότι έχει και καφέ μέσα.»
 *
 * Η κατηγορία «Έξοδα FnB» έστελνε το έξοδο στη μονάδα F&B του καταστήματος, χωρίς να ρωτά αν το
 * κατάστημα έχει καφέ. Στα πραγματικά δεδομένα: 28 έξοδα του Play, 4.540,35 €.
 *
 * Το λάθος που κοστίζει είναι να χαθεί ή να διπλομετρηθεί ένα ποσό όταν αλλάζει κουβά, και να
 * κρυφτεί τζίρος ή μισθοδοσία καφέ που έχει ήδη γραφτεί. Γι' αυτό τα τεστ μετράνε αθροίσματα.
 */

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), 'utf8');

const PLAY = 'store_401070';
const LAMIA = 'store_101499';

const stores = (play: Partial<PnlStore> = {}, lamia: Partial<PnlStore> = {}): PnlStore[] => [
  { id: LAMIA, code: '101499', name: 'Allwyn Store #499 | Lamia', storeType: 'OPAP_AGENCY', ...lamia },
  { id: PLAY, code: '401070', name: 'Allwyn Play', storeType: 'PLAY_STORE', ...play },
];

let seq = 0;
const expense = (storeId: string, date: string, recipient: string, amount: number, category: string): PnlExpense => ({
  id: `e${++seq}`,
  storeId,
  date,
  category,
  recipient,
  amount,
});

const base = (list: PnlStore[], expenses: PnlExpense[], extra: Partial<MonthlyPnlInput> = {}): MonthlyPnlInput => ({
  month: '2026-11',
  stores: list,
  commissions: [],
  fixedCosts: [],
  payroll: [],
  companyCosts: [],
  companyDaily: [],
  expenses,
  shifts: [],
  fnbManualDays: [],
  vltCounts: [],
  ...extra,
});

// Το Play: κάβα και καφέδες για τους πελάτες + ένα έξοδο γενικό. Η Λαμία: το δικό της κυλικείο.
const EXPENSES: PnlExpense[] = [
  expense(PLAY, '2026-11-03', 'Κάβα', 1200.5, 'EXPENSES_FNB'),
  expense(PLAY, '2026-11-04', 'Καφέδες', 340.25, 'EXPENSES_FNB'),
  expense(PLAY, '2026-11-05', 'Καθαριστικά', 60, 'EXPENSES_GP'),
  expense(LAMIA, '2026-11-03', 'Καφές', 150, 'EXPENSES_FNB'),
  expense(LAMIA, '2026-11-05', 'ΔΕΗ', 90, 'EXPENSES_GP'),
];

const unitOf = (result: ReturnType<typeof computeMonthlyPnl>, storeId: string, unit: 'STORE' | 'FNB') =>
  result.units.find((u) => u.storeId === storeId && u.unit === unit);

const round2 = (n: number) => Math.round(n * 100) / 100;

describe('ποιο κατάστημα έχει καφέ', () => {
  it('ο διακόπτης του προτύπου αποφασίζει, όπου έχει γραφτεί', () => {
    expect(storeHasCafe(true, 'PLAY_STORE')).toBe(true);
    expect(storeHasCafe(false, 'OPAP_AGENCY')).toBe(false);
  });

  it('χωρίς πρότυπο, η απάντηση που θα έδινε το πρότυπο όταν φτιαχτεί: Play όχι, πρακτορείο ναι', () => {
    expect(storeHasCafe(undefined, 'PLAY_STORE')).toBe(false);
    expect(storeHasCafe(null, 'PLAY_STORE')).toBe(false);
    expect(storeHasCafe(undefined, 'OPAP_AGENCY')).toBe(true);
    expect(storeHasCafe(null, 'OPAP_FNB')).toBe(true);
  });
});

describe('P&L: το Play ως ανεξάρτητο μαγαζί', () => {
  const noCafe = computeMonthlyPnl(base(stores({ hasCafe: false }, { hasCafe: true }), EXPENSES));

  it('τα έξοδα του Play μένουν στο Play, σε σύνολο', () => {
    // 1.200,50 + 340,25 + 60 = 1.600,75
    expect(unitOf(noCafe, PLAY, 'STORE')!.dailyExpenses).toBe(1600.75);
    const sheet = noCafe.stores.find((s) => s.store.id === PLAY)!;
    expect(sheet.dailyExpenses.total).toBe(1600.75);
  });

  it('το Play δεν έχει μονάδα F&B ούτε ενότητα καφέ', () => {
    expect(unitOf(noCafe, PLAY, 'FNB')).toBeUndefined();
    expect(noCafe.stores.find((s) => s.store.id === PLAY)!.fnb).toBeNull();
    expect(noCafe.payroll.some((g) => g.storeId === PLAY && g.unit === 'FNB')).toBe(false);
  });

  it('ο καφές της Λαμίας μένει μόνος του: μόνο τα δικά της έξοδα καφέ', () => {
    expect(unitOf(noCafe, LAMIA, 'FNB')!.dailyExpenses).toBe(150);
    expect(unitOf(noCafe, LAMIA, 'STORE')!.dailyExpenses).toBe(90);
    expect(noCafe.fnb.dailyExpenses).toBe(150);
  });

  it('κανένα ποσό δεν χάνεται ούτε διπλομετριέται: ίδιο σύνολο εξόδων με πριν', () => {
    const before = computeMonthlyPnl(base(stores({}, { hasCafe: true }), EXPENSES)); // το Play ως τώρα
    const dailyOf = (r: typeof noCafe) => round2(r.units.reduce((a, u) => a + u.dailyExpenses, 0));
    expect(dailyOf(noCafe)).toBe(round2(EXPENSES.reduce((a, e) => a + e.amount, 0)));
    expect(dailyOf(noCafe)).toBe(dailyOf(before));
    // Πριν: τα 1.540,75 € του Play ήταν στο «F&B», δίπλα στον καφέ της Λαμίας.
    expect(unitOf(before, PLAY, 'FNB')!.dailyExpenses).toBe(1540.75);
    expect(before.fnb.dailyExpenses).toBe(1690.75);
  });

  it('η αναφορά «FnB» δεν δείχνει πια το Play· η αναφορά του Play δείχνει όλα τα έξοδά του', () => {
    const fnbScope = scopedUnits(noCafe, scopeRule('FNB'));
    expect(fnbScope.map((u) => u.storeId)).toEqual([LAMIA]);
    const playScope = scopedUnits(noCafe, scopeRule(PLAY));
    expect(playScope.reduce((a, u) => a + u.dailyExpenses, 0)).toBe(1600.75);
  });

  it('αν μόνο το Play έχει έξοδα «FnB» και κανένα κατάστημα δεν έχει καφέ, δεν υπάρχει καφές στο P&L', () => {
    const r = computeMonthlyPnl(base(stores({ hasCafe: false }, { hasCafe: false }), EXPENSES.filter((e) => e.storeId === PLAY)));
    expect(r.hasFnb).toBe(false);
    expect(r.fnb.dailyExpenses).toBe(0);
    expect(unitOf(r, PLAY, 'STORE')!.dailyExpenses).toBe(1600.75);
  });
});

describe('P&L: τα έσοδα και η μισθοδοσία που έχουν γραφτεί δεν κρύβονται', () => {
  it('τζίρος καφέ από βάρδιες σε κατάστημα με κλειστό διακόπτη → ο καφές υπάρχει', () => {
    const r = computeMonthlyPnl(
      base(stores({ hasCafe: false }), EXPENSES, {
        shifts: [
          {
            id: 's1', storeId: PLAY, openedAt: '2026-11-03T08:00:00Z', status: 'APPROVED', operatorName: 'Υπάλληλος',
            fnbCash: 80, fnbCard: 20, countedCash: 0, discrepancy: 0, topUps: 0,
          },
        ],
      })
    );
    expect(unitOf(r, PLAY, 'FNB')).toBeDefined();
    expect(unitOf(r, PLAY, 'FNB')!.revenue).toBe(100);
    expect(unitOf(r, PLAY, 'FNB')!.dailyExpenses).toBe(1540.75);
  });

  it('χειροκίνητη ημέρα καφέ → ο καφές υπάρχει', () => {
    const r = computeMonthlyPnl(
      base(stores({ hasCafe: false }), EXPENSES, { fnbManualDays: [{ storeId: PLAY, day: '2026-11-10', cash: 50, pos: 0 }] })
    );
    expect(unitOf(r, PLAY, 'FNB')!.revenue).toBe(50);
  });

  it('μισθοδοσία F&B → ο καφές υπάρχει', () => {
    const r = computeMonthlyPnl(
      base(stores({ hasCafe: false }), EXPENSES, {
        payroll: [
          {
            storeId: PLAY, unit: 'FNB', period: '2026-11-01', name: 'Σερβιτόρος', baseSalary: 700, salaryIncrease: 0,
            overtimeAmount: 0, christmasBonus: 0, holidayAllowance: 0, leaveDaysTaken: 0, leaveCompensation: 0,
            bonus: 0, bankAmount: 0, advancePayment: 0,
          },
        ],
      })
    );
    expect(unitOf(r, PLAY, 'FNB')).toBeDefined();
  });
});

describe('P&L: ό,τι δεν ξέρουμε μένει όπως ήταν', () => {
  it('χωρίς απάντηση (hasCafe δεν δόθηκε) ο διαχωρισμός είναι αυτός που ήταν', () => {
    const r = computeMonthlyPnl(base(stores(), EXPENSES));
    expect(unitOf(r, PLAY, 'FNB')!.dailyExpenses).toBe(1540.75);
    expect(unitOf(r, LAMIA, 'FNB')!.dailyExpenses).toBe(150);
  });

  it('κατάστημα με δηλωμένο καφέ → ο διαχωρισμός ισχύει κανονικά', () => {
    const r = computeMonthlyPnl(base(stores({ hasCafe: true }, { hasCafe: true }), EXPENSES));
    expect(unitOf(r, PLAY, 'FNB')!.dailyExpenses).toBe(1540.75);
    expect(unitOf(r, PLAY, 'STORE')!.dailyExpenses).toBe(60);
  });
});

describe('οι οθόνες βάρδιας: το ΓΠ / FnB μόνο σε κατάστημα με καφέ', () => {
  const rows = [
    { amount: 100, category: 'EXPENSES_FNB', payment_method: 'CASH' },
    { amount: 40, category: 'EXPENSES_GP', payment_method: 'CASH' },
  ];

  it('χωρίς καφέ: όλα στο ΓΠ, το σύνολο ίδιο', () => {
    const s = splitShiftExpenses({ total: 140, rows, hasCafe: false });
    expect(s).toMatchObject({ gp: 140, fnb: 0, total: 140 });
  });

  it('με καφέ ή χωρίς απάντηση: όπως πριν', () => {
    expect(splitShiftExpenses({ total: 140, rows, hasCafe: true })).toMatchObject({ gp: 40, fnb: 100, total: 140 });
    expect(splitShiftExpenses({ total: 140, rows })).toMatchObject({ gp: 40, fnb: 100, total: 140 });
  });

  it('ο διαχωρισμός που έγραψε το ίδιο το κλείσιμο κερδίζει πάντα', () => {
    const s = splitShiftExpenses({ total: 140, storedGp: 90, storedFnb: 50, rows, hasCafe: false });
    expect(s).toMatchObject({ gp: 90, fnb: 50, source: 'STORED' });
  });

  it('το σύνολο είναι πάντα το ποσό που μέτρησε το ταμείο, με ή χωρίς καφέ', () => {
    for (const hasCafe of [true, false, undefined]) {
      expect(splitShiftExpenses({ total: 140, rows, hasCafe }).total).toBe(140);
    }
  });
});

describe('σύνδεση: από τη ρύθμιση του καταστήματος μέχρι την οθόνη', () => {
  it('το P&L διαβάζει τον διακόπτη από τα πρότυπα του οργανισμού, και δεν πέφτει αν αποτύχει', () => {
    const svc = read('src/services/pnlService.ts');
    expect(svc).toContain("const TEMPLATES_TABLE = 'shift_templates'");
    expect(svc).toMatch(/select\('store_id, show_fnb'\)\.eq\('organization_id', orgId\)/);
    expect(svc).toContain('hasCafe: storeHasCafe(switches.get(store.id), store.storeType)');
    expect(svc).toContain('stores: storesWithCafe,');
    // Αποτυχία → τα καταστήματα γυρίζουν όπως ήταν.
    expect(svc).toMatch(/catch \(err\) \{[\s\S]{0,200}return stores;/);
  });

  it('η μηχανή ρωτά «έχει καφέ;» πριν στείλει ένα έξοδο στο F&B, και μόνο το false το κλείνει', () => {
    const engine = read('src/lib/pnlEngine.ts');
    expect(engine).toContain('const runsCafe = store.hasCafe !== false || fnbTurnover !== 0 || fnbPayroll.length > 0;');
    expect(engine).toContain('const isCafeExpense = (category: string) => runsCafe && isFnb(category);');
    expect(engine).not.toMatch(/filter\(\(e\) => isFnb\(e\.category\)\)/);
  });

  it('το κλείσιμο και οι λεπτομέρειες διαβάζουν τον ίδιο διακόπτη', () => {
    const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');
    expect(wizard).toContain('const isFnbExpense = (category?: string) => modules.fnb && isFnbCategory(category, expenseCategories);');
    const details = read('src/components/shifts/ShiftDetailsModal.tsx');
    expect(details).toContain('setStoreHasCafe((config as any)?.show_fnb !== false);');
    expect(details).toContain('hasCafe: storeHasCafe,');
  });
});
