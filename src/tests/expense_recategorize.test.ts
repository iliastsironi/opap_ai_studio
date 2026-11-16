import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { ExpenseCategoryDef, isLiveShiftStatus, tillExpensesOnly } from '../lib/expenseCategories.ts';
import { MoveLeftDuplicateError, chargeChangeBlock, moveExpense } from '../lib/expenseMove.ts';

/**
 * Ο πράκτορας: «ας βάλει στο έξοδο μία επιλογή να το χρεώνουμε εμείς κατά
 * βούληση· αν δεν την πατάμε, να μη χρεώνεται σε κανένα ταμείο, απλά να
 * καταχωρείται στα έξοδα». Και ο ιδιοκτήτης: «ανάλογα το έξοδο να μπορούμε να
 * το αλλάξουμε κατηγορία, αν είναι έξοδα εταιρίας ή πάγιο ή κάτι άλλο».
 *
 * Η επιλογή ζει πάνω στο έξοδο (charged_to_till, 0085). Η κατηγορία δεν
 * αποφασίζει τίποτα για το ταμείο - μια πρώτη εκδοχή με διακόπτη ανά κατηγορία
 * μπέρδευε και αντικαταστάθηκε. Οι κλεισμένες βάρδιες μένουν όπως είναι.
 */

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8');

const cat = (over: Partial<ExpenseCategoryDef>): ExpenseCategoryDef => ({
  key: 'K', label: 'K', side: 'AGENCY', sortOrder: 1, isActive: true, isBuiltin: false, ...over,
});

const categories: ExpenseCategoryDef[] = [
  cat({ key: 'EXPENSES_GP' }),
  cat({ key: 'UTILITIES' }),
  cat({ key: 'CUSTOM_PAGIA_EXODA', label: 'Πάγια Έξοδα' }),
  cat({ key: 'EXPENSES_COMPANY', side: 'COMPANY' }),
  cat({ key: 'CUSTOM_EFKA', side: 'COMPANY' }),
  cat({ key: 'EXPENSES_FNB', side: 'FNB' }),
];

describe('ποια έξοδα μετράνε στο ταμείο', () => {
  const day = [
    { id: 'charged', category: 'EXPENSES_GP', charged_to_till: true, amount: 40 },
    { id: 'old', category: 'UTILITIES', amount: 142.5 },                       // γραμμή πριν το 0085: δεν έχει τη στήλη
    { id: 'notCharged', category: 'EXPENSES_GP', charged_to_till: false, amount: 1450.4 },
    { id: 'company', category: 'EXPENSES_COMPANY', charged_to_till: true, amount: 1200 },
  ];

  it('μετράει ό,τι χρεώθηκε και ό,τι δεν έχει τη στήλη· όχι ό,τι δεν χρεώθηκε, όχι της εταιρίας', () => {
    expect(tillExpensesOnly(day, categories).map((e) => e.id)).toEqual(['charged', 'old']);
  });

  it('το ταμείο δεν χρεώνεται το ενοίκιο που δεν τσεκαρίστηκε', () => {
    const charged = tillExpensesOnly(day, categories).reduce((t, e) => t + e.amount, 0);
    expect(charged).toBe(182.5);
  });

  it('η κατηγορία ΔΕΝ αποφασίζει: «Πάγια Έξοδα» που τσεκαρίστηκε μετράει, ΓΠ που δεν τσεκαρίστηκε όχι', () => {
    const rows = [
      { id: 'pagia', category: 'CUSTOM_PAGIA_EXODA', charged_to_till: true },
      { id: 'gp', category: 'EXPENSES_GP', charged_to_till: false },
    ];
    expect(tillExpensesOnly(rows, categories).map((e) => e.id)).toEqual(['pagia']);
  });

  it('εταιρική κατηγορία δεν μετράει ποτέ, ούτε με τσεκαρισμένη στήλη', () => {
    const rows = [{ id: 'c', category: 'CUSTOM_EFKA', charged_to_till: true }, { id: 'e', category: 'EXPENSES_COMPANY' }];
    expect(tillExpensesOnly(rows, categories)).toEqual([]);
  });

  it('null σε στήλη ή χωρίς λίστα κατηγοριών: μετράει, όπως πάντα', () => {
    expect(tillExpensesOnly([{ id: 'x', category: 'EXPENSES_GP', charged_to_till: null }], categories).map((e) => e.id)).toEqual(['x']);
    expect(tillExpensesOnly([{ id: 'x', category: 'EXPENSES_GP' }], []).map((e) => e.id)).toEqual(['x']);
    expect(tillExpensesOnly([{ id: 'c', category: 'EXPENSES_COMPANY' }], [])).toEqual([]);   // η ενσωματωμένη εταιρική φεύγει ούτως ή άλλως
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

describe('πότε ΔΕΝ γίνεται η αλλαγή στη χρέωση του ταμείου', () => {
  const base = { fromCharged: true, toCharged: false, toCompany: false, shiftStatus: 'APPROVED', shiftIsLive: false };

  it('έξοδο κλεισμένης βάρδιας δεν βγαίνει από το ταμείο της', () => {
    expect(chargeChangeBlock(base)).toContain('έχει κλείσει');
  });

  it('εξαίρεση: η μετακίνηση στα έξοδα εταιρίας γίνεται και σε κλεισμένη βάρδια', () => {
    expect(chargeChangeBlock({ ...base, toCompany: true })).toBeNull();
  });

  it('χωρίς αλλαγή στη χρέωση, η διόρθωση (π.χ. ποσό, κατηγορία) γίνεται κανονικά', () => {
    expect(chargeChangeBlock({ ...base, toCharged: true })).toBeNull();
    expect(chargeChangeBlock({ ...base, fromCharged: false })).toBeNull();
  });

  it('ζωντανή βάρδια, ή έξοδο χωρίς βάρδια: γίνεται', () => {
    expect(chargeChangeBlock({ ...base, shiftStatus: 'OPEN', shiftIsLive: true })).toBeNull();
    expect(chargeChangeBlock({ ...base, shiftStatus: null, shiftIsLive: false })).toBeNull();
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
  const moves = read('src/services/expenseMoves.ts');
  const moduleServices = read('src/services/moduleServices.ts');
  const wizard = read('src/components/shifts/ShiftClosingWizard.tsx');
  const details = read('src/components/shifts/ShiftDetailsModal.tsx');
  const newCategory = read('src/components/modules/NewExpenseCategoryModal.tsx');
  const pnl = read('src/services/pnlService.ts');
  const lib = read('src/lib/expenseCategories.ts');

  it('δεν υπάρχει πια διακόπτης ανά κατηγορία: ένα έξοδο, μία επιλογή', () => {
    for (const code of [lib, pnl, newCategory, wizard]) {
      expect(code).not.toContain('paidFromTill');
      expect(code).not.toContain('paid_from_till');
    }
    expect(newCategory).not.toContain('Πληρώνεται από το ταμείο');
  });

  it('το άθροισμα expenses_paid_cash ξαναμετριέται με το ίδιο φίλτρο του ταμείου', () => {
    const sync = moduleServices.slice(moduleServices.indexOf('export async function syncShiftExpensesCashTotal'));
    expect(sync.slice(0, 900)).toContain('tillExpensesOnly(');
    expect(sync.slice(0, 900)).toContain('fetchExpenseCategories(orgId)');
  });

  it('ένα νέο έξοδο γράφει τη στήλη ΜΟΝΟ όταν είναι «όχι», ώστε το «ναι» να μη χρειάζεται το 0085', () => {
    expect(moduleServices).toContain('...(input.charged_to_till === false ? { charged_to_till: false } : {})');
  });

  it('η λίστα του κλεισίματος και η λίστα εξόδων της βάρδιας χρησιμοποιούν το ίδιο φίλτρο', () => {
    expect(wizard).toContain('tillExpensesOnly(expenses, expenseCategories)');
    expect(wizard).toContain('tillExpensesOnly(storeExpenses, expenseCategories)');
    expect(details).toContain('tillExpensesOnly(shiftExpenses, expenseCategories)');
    expect(details).toContain('{tillRows.map((exp) => (');
  });

  it('μέσα στη βάρδια προσφέρονται όλες οι κατηγορίες εκτός από τις εταιρικές', () => {
    const at = wizard.indexOf('const tillCategoryOptions = expenseCategoryOptions.filter(');
    expect(wizard.slice(at, at + 160)).toContain('!isCompanyCategory(c.key, expenseCategories)');
  });

  it('έξοδο εταιρίας που μετακινείται σε κατάστημα δεν χρεώνεται σε κανένα ταμείο', () => {
    const toStore = moves.slice(moves.indexOf('export async function moveCompanyExpenseToStore'));
    expect(toStore).toContain('charged_to_till: false,');
  });

  it('η κλεισμένη βάρδια δεν ξαναμετριέται στη μετακίνηση προς την εταιρία', () => {
    expect(moves).toContain('isLiveShiftStatus(status)');
  });

  it('κάθε σβήσιμο της μετακίνησης μετράει τις γραμμές που έσβησε', () => {
    expect(moves).toContain("delete({ count: 'exact' })");
    expect(moves).toContain('rowsWrittenProblem(count)');
  });
});

describe('το migration 0085', () => {
  const sql = read('supabase/migrations/0085_an_expense_is_charged_to_the_till_by_choice.sql');
  const body = sql.replace(/--.*$/gm, '');

  it('προσθέτει τη στήλη με default «ναι»: κάθε υπάρχον έξοδο συμπεριφέρεται όπως πριν', () => {
    expect(body).toMatch(/ALTER TABLE shift_expenses\s+ADD COLUMN IF NOT EXISTS charged_to_till BOOLEAN NOT NULL DEFAULT TRUE/);
  });

  it('δεν αγγίζει ούτε βάρδιες ούτε υπάρχοντα έξοδα', () => {
    expect(body).not.toMatch(/\bUPDATE\b/i);
    expect(body).not.toMatch(/\bDELETE\b/i);
    expect(body).not.toMatch(/\bshifts\b/i);
  });
});
