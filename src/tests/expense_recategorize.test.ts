import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  BUILTIN_EXPENSE_CATEGORIES,
  ExpenseCategoryDef,
  countsInTill,
  isLiveShiftStatus,
  tillExpensesOnly,
} from '../lib/expenseCategories.ts';
import { MoveLeftDuplicateError, categoryChangeBlock, moveExpense } from '../lib/expenseMove.ts';

/**
 * Ο ιδιοκτήτης: «τα πάγια χρεώνονται στο ταμείο, δεν πρέπει» και «ανάλογα το
 * έξοδο να μπορούμε να το αλλάξουμε κατηγορία, αν είναι έξοδα εταιρίας ή
 * πάγιο ή κάτι άλλο».
 *
 * Η κατηγορία αποφασίζει αν ένα έξοδο βγαίνει από το συρτάρι της βάρδιας (ο
 * διακόπτης «πληρώνεται από το ταμείο»), και η κατηγορία αλλάζει μετά. Οι
 * κλεισμένες βάρδιες μένουν όπως είναι - εκτός από τα έξοδα εταιρίας.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const cat = (over: Partial<ExpenseCategoryDef>): ExpenseCategoryDef => ({
  key: 'K', label: 'K', side: 'AGENCY', sortOrder: 1, isActive: true, isBuiltin: false, ...over,
});

const categories: ExpenseCategoryDef[] = [
  cat({ key: 'EXPENSES_GP' }),
  cat({ key: 'UTILITIES', label: 'Λογαριασμοί / ΔΕΗ (ΓΠ)' }),
  cat({ key: 'CUSTOM_PAGIA_EXODA', label: 'Πάγια Έξοδα', paidFromTill: false }),
  cat({ key: 'EXPENSES_COMPANY', side: 'COMPANY', paidFromTill: false }),
  cat({ key: 'CUSTOM_EFKA', side: 'COMPANY' }),            // εταιρική, ΧΩΡΙΣ τον διακόπτη γραμμένο
  cat({ key: 'EXPENSES_FNB', side: 'FNB' }),
];

describe('μετράει ένα έξοδο στο ταμείο;', () => {
  it('συνηθισμένη κατηγορία μετράει, όπως πάντα', () => {
    expect(countsInTill('EXPENSES_GP', categories)).toBe(true);
    expect(countsInTill('UTILITIES', categories)).toBe(true);
    expect(countsInTill('EXPENSES_FNB', categories)).toBe(true);
  });

  it('κατηγορία με διακόπτη «όχι» δεν μετράει', () => {
    expect(countsInTill('CUSTOM_PAGIA_EXODA', categories)).toBe(false);
  });

  it('εταιρική δεν μετράει ποτέ, και ΧΩΡΙΣ διακόπτη γραμμένο', () => {
    expect(countsInTill('EXPENSES_COMPANY', categories)).toBe(false);
    expect(countsInTill('CUSTOM_EFKA', categories)).toBe(false);
  });

  it('άγνωστη κατηγορία ή χωρίς λίστα μετράει - ό,τι δεν ξέρουμε δεν κρύβεται από το ταμείο', () => {
    expect(countsInTill('ΚΑΤΙ_ΑΛΛΟ', categories)).toBe(true);
    expect(countsInTill('EXPENSES_GP', [])).toBe(true);
    expect(countsInTill(undefined, categories)).toBe(true);
    expect(countsInTill('EXPENSES_COMPANY', [])).toBe(false);   // η ενσωματωμένη εταιρική φεύγει ούτως ή άλλως
  });

  it('η ενσωματωμένη εταιρική δηλώνει ρητά «όχι»', () => {
    expect(BUILTIN_EXPENSE_CATEGORIES.find((c) => c.key === 'EXPENSES_COMPANY')?.paidFromTill).toBe(false);
    expect(BUILTIN_EXPENSE_CATEGORIES.filter((c) => c.side !== 'COMPANY').every((c) => c.paidFromTill !== false)).toBe(true);
  });
});

describe('το ταμείο της ημέρας', () => {
  const day = [
    { id: 'a', category: 'EXPENSES_GP', amount: 40 },
    { id: 'b', category: 'UTILITIES', amount: 142.5 },        // η Cosmote: πληρώθηκε από το συρτάρι
    { id: 'c', category: 'CUSTOM_PAGIA_EXODA', amount: 1450.4 }, // το ενοίκιο: με έμβασμα
    { id: 'd', category: 'EXPENSES_COMPANY', amount: 1200 },
  ];

  it('δεν χρεώνεται το ενοίκιο, χρεώνεται η Cosmote', () => {
    expect(tillExpensesOnly(day, categories).map((e) => e.id)).toEqual(['a', 'b']);
    const charged = tillExpensesOnly(day, categories).reduce((t, e) => t + e.amount, 0);
    expect(charged).toBe(182.5);
  });

  it('η ίδια κατηγορία χωρίς διακόπτη στη βάση (πριν το 0084) χρεώνει όπως πριν', () => {
    const before = categories.map((c) => ({ ...c, paidFromTill: undefined }));
    expect(tillExpensesOnly(day, before).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('ποια βάρδια ξαναϋπολογίζεται', () => {
  it('ανοιχτή, σε κλείσιμο ή ξανανοιγμένη: ζωντανή', () => {
    for (const s of ['OPEN', 'DRAFT_CLOSING', 'REOPENED']) expect(isLiveShiftStatus(s)).toBe(true);
  });
  it('υποβλημένη, εγκεκριμένη, σε διόρθωση, ή άγνωστη: κλεισμένη', () => {
    for (const s of ['SUBMITTED', 'APPROVED', 'CORRECTION_REQUESTED', undefined, null, '']) expect(isLiveShiftStatus(s)).toBe(false);
  });
});

describe('πότε ΔΕΝ γίνεται η αλλαγή κατηγορίας', () => {
  const base = { fromCountsInTill: true, toCountsInTill: false, toCompany: false, shiftStatus: 'APPROVED', shiftIsLive: false };

  it('έξοδο κλεισμένης βάρδιας: δεν βγαίνει από το ταμείο και δεν μπαίνει σε αυτό', () => {
    expect(categoryChangeBlock(base)).toContain('έχει κλείσει');
    expect(categoryChangeBlock({ ...base, fromCountsInTill: false, toCountsInTill: true })).toContain('έχει κλείσει');
  });

  it('εξαίρεση: η μετακίνηση στα έξοδα εταιρίας γίνεται και σε κλεισμένη βάρδια', () => {
    expect(categoryChangeBlock({ ...base, toCompany: true, toCountsInTill: false })).toBeNull();
  });

  it('ίδιος χειρισμός ταμείου: γίνεται κανονικά, όπως πάντα', () => {
    expect(categoryChangeBlock({ ...base, toCountsInTill: true })).toBeNull();
    expect(categoryChangeBlock({ ...base, fromCountsInTill: false, toCountsInTill: false })).toBeNull();
  });

  it('ζωντανή βάρδια, ή έξοδο χωρίς βάρδια: γίνεται', () => {
    expect(categoryChangeBlock({ ...base, shiftStatus: 'OPEN', shiftIsLive: true })).toBeNull();
    expect(categoryChangeBlock({ ...base, shiftStatus: null, shiftIsLive: false })).toBeNull();
  });
});

describe('η μετακίνηση ανάμεσα σε κατάστημα και εταιρία', () => {
  const log: string[] = [];
  const steps = (over: Partial<Parameters<typeof moveExpense>[0]> = {}) => {
    log.length = 0;
    return {
      create: async () => { log.push('create'); return { id: 'new1' }; },
      removeOld: async () => { log.push('remove'); },
      undoCreate: async (id: string) => { log.push(`undo:${id}`); },
      ...over,
    };
  };

  it('πρώτα γράφει στον προορισμό, μετά σβήνει από την πηγή', async () => {
    const out = await moveExpense(steps());
    expect(log).toEqual(['create', 'remove']);
    expect(out.id).toBe('new1');
  });

  it('αν αποτύχει η εγγραφή, δεν σβήνεται τίποτα', async () => {
    await expect(moveExpense(steps({ create: async () => { log.push('create'); throw new Error('δίκτυο'); } }))).rejects.toThrow('δίκτυο');
    expect(log).toEqual(['create']);
  });

  it('αν αποτύχει το σβήσιμο, η εγγραφή αναιρείται και μένει ένα αντίγραφο', async () => {
    await expect(
      moveExpense(steps({ removeOld: async () => { log.push('remove'); throw new Error('RLS'); } }))
    ).rejects.toThrow('RLS');
    expect(log).toEqual(['create', 'remove', 'undo:new1']);
  });

  it('αν αποτύχει και η αναίρεση, το λέει φωναχτά: υπάρχει ΔΙΠΛΟ', async () => {
    const err = await moveExpense(
      steps({
        removeOld: async () => { throw new Error('RLS'); },
        undoCreate: async () => { throw new Error('κόπηκε το δίκτυο'); },
      })
    ).catch((e) => e);
    expect(err).toBeInstanceOf(MoveLeftDuplicateError);
    expect(err.message).toContain('ΔΙΠΛΟ');
    expect(err.message).toContain('RLS');
  });
});

describe('το καλώδιο στις οθόνες και στις υπηρεσίες', () => {
  const manager = read('src/components/modules/ExpensesManager.tsx');
  const moves = read('src/services/expenseMoves.ts');
  const moduleServices = read('src/services/moduleServices.ts');
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');
  const details = read('src/components/shifts/ShiftDetailsModal.tsx');
  const newCategory = read('src/components/modules/NewExpenseCategoryModal.tsx');
  const pnl = read('src/services/pnlService.ts');

  it('η φόρμα δεν αρνείται πια την αλλαγή από κατάστημα σε εταιρία', () => {
    expect(manager).not.toContain('δεν αλλάζει από έξοδο καταστήματος σε έξοδο εταιρίας');
    expect(manager).toContain('await moveStoreExpenseToCompany(');
    expect(manager).toContain('await moveCompanyExpenseToStore(');
  });

  it('στη διόρθωση προσφέρονται όλες οι κατηγορίες, όχι μόνο της ίδιας πλευράς', () => {
    expect(manager).not.toContain('isCompanyCategory(c.key, categories) === !!editing.isCompany');
  });

  it('η αλλαγή κατηγορίας κρίνεται από τη βάρδια ΠΡΙΝ γραφτεί οτιδήποτε', () => {
    const from = manager.indexOf('// Κατάστημα → κατάστημα.');
    expect(from).toBeGreaterThan(0);
    const edit = manager.slice(from, manager.indexOf('await updateAndSyncShiftExpense(', from));
    expect(edit).toContain('shiftStatusOf(editing.shift_id)');
    expect(edit).toContain('categoryChangeBlock(');
    expect(edit).toContain('if (blocked)');
  });

  it('νέο έξοδο σε κατηγορία εκτός ταμείου δεν δένεται στη βάρδια που είναι ανοιχτή', () => {
    expect(manager).toContain('categoryCountsInTill ? activeShift : null');
  });

  it('το άθροισμα expenses_paid_cash ξαναμετριέται με το ίδιο φίλτρο του ταμείου', () => {
    const sync = moduleServices.slice(moduleServices.indexOf('export async function syncShiftExpensesCashTotal'));
    expect(sync.slice(0, 900)).toContain('tillExpensesOnly(');
    expect(sync.slice(0, 900)).toContain('fetchExpenseCategories(orgId)');
  });

  it('η κλεισμένη βάρδια δεν ξαναμετριέται στη μετακίνηση προς την εταιρία', () => {
    expect(moves).toContain('isLiveShiftStatus(status)');
    const toCompany = moves.slice(moves.indexOf('export async function moveStoreExpenseToCompany'), moves.indexOf('export async function moveCompanyExpenseToStore'));
    expect(toCompany.indexOf('isLiveShiftStatus(status)')).toBeGreaterThan(toCompany.indexOf('syncShiftExpensesCashTotal') - 80);
  });

  it('κάθε σβήσιμο της μετακίνησης μετράει τις γραμμές που έσβησε', () => {
    expect(moves).toContain("delete({ count: 'exact' })");
    expect(moves).toContain('rowsWrittenProblem(count)');
    expect(moves).not.toContain('deleteCompanyDailyExpense(');
  });

  it('η οθόνη του ταμείου προσφέρει μόνο κατηγορίες που πληρώνονται από το ταμείο', () => {
    expect(wizard).toContain('(c) => countsInTill(c.key, expenseCategories)');
    expect(wizard).toContain('export { tillExpensesOnly };');
  });

  it('η λίστα εξόδων της βάρδιας δεν δείχνει ό,τι δεν πληρώθηκε από το συρτάρι', () => {
    expect(details).toContain('tillExpensesOnly(shiftExpenses, expenseCategories)');
    expect(details).toContain('rows: tillRows,');
    expect(details).toContain('{tillRows.map((exp) => (');
  });

  it('η νέα κατηγορία έχει τον διακόπτη, και τον γράφει στη βάση ΜΟΝΟ όταν είναι «όχι»', () => {
    expect(newCategory).toContain('Πληρώνεται από το ταμείο της βάρδιας');
    expect(newCategory).toContain("side === 'COMPANY' ? true : paidFromTill");
    expect(pnl).toContain('...(paidFromTill ? {} : { paid_from_till: false })');
    expect(pnl).toContain('paidFromTill: r.paid_from_till !== false');
  });
});

describe('το migration 0084', () => {
  const sql = read('supabase/migrations/0084_a_category_can_stay_out_of_the_till.sql');

  it('προσθέτει τη στήλη με default «ναι», ώστε τίποτα να μην αλλάζει από μόνο του', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS paid_from_till BOOLEAN NOT NULL DEFAULT TRUE/);
  });

  it('βγάζει από το ταμείο μόνο τα «Πάγια Έξοδα» και τις εταιρικές', () => {
    expect(sql).toMatch(/side = 'COMPANY' OR key = 'CUSTOM_PAGIA_EXODA'/);
    // Οι Λογαριασμοί / ΔΕΗ πληρώθηκαν από το συρτάρι στα πραγματικά κλεισίματα: μένουν «ναι».
    expect(sql.replace(/--.*$/gm, '')).not.toMatch(/UTILITIES/);
  });

  it('δεν αγγίζει βάρδιες ούτε έξοδα', () => {
    const body = sql.replace(/--.*$/gm, '');
    expect(body).not.toMatch(/\bshifts\b/i);
    expect(body).not.toMatch(/shift_expenses/i);
  });
});
