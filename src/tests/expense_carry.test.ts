import { describe, expect, it } from 'vitest';
import { expenseOrigin, isCarriedExpense } from '../lib/expenseCarry.ts';
import { tillExpensesOnly } from '../components/shifts/ShiftClosingWizard.tsx';
import type { ExpenseCategoryDef } from '../lib/expenseCategories.ts';

const SHIFT = 'evening';

describe('ποια έξοδα της ημέρας μπορεί να αλλάξει αυτή η βάρδια', () => {
  it('δεν αγγίζει ό,τι κατέγραψε άλλη βάρδια', () => {
    // Η περίπτωση που κόστιζε χρήματα: τα έξοδα της πρωινής έφταναν από τον
    // server και πετιόνταν, οπότε η βραδινή συμφωνούσε χωρίς αυτά και το
    // ταμείο της έβγαινε πλεόνασμα ακριβώς κατά το ποσό τους.
    expect(expenseOrigin({ shift_id: 'morning' }, SHIFT)).toBe('OTHER_SHIFT');
    expect(isCarriedExpense({ shift_id: 'morning' }, SHIFT)).toBe(true);
  });

  it('κρατάει δικό της ό,τι έγραψε η ίδια', () => {
    expect(expenseOrigin({ shift_id: SHIFT }, SHIFT)).toBe('OWN');
    expect(isCarriedExpense({ shift_id: SHIFT }, SHIFT)).toBe(false);
  });

  it('ένα έξοδο χωρίς βάρδια δεν είναι δικό καμιάς - και δεν αλλάζει εδώ', () => {
    // Ο ιδιοκτήτης: «τα είχε μη επεξεργάσιμα, τώρα τα εμφανίζει
    // επεξεργάσιμα, δεν το θέλουμε αυτό».
    expect(expenseOrigin({ shift_id: null }, SHIFT)).toBe('NO_SHIFT');
    expect(isCarriedExpense({ shift_id: null }, SHIFT)).toBe(true);
    expect(isCarriedExpense({}, SHIFT)).toBe(true);
  });

  it('δεν ρωτάει πότε πληκτρολογήθηκε, γιατί η απάντηση είναι άσχετη', () => {
    // Αυτό έσπασε: ο παλιός κανόνας διάβαζε το created_at σαν ώρα της
    // αγοράς. Σε αυτό το πρακτορείο η μέρα γράφεται αργότερα - τα έξοδα
    // της 19ης Οκτωβρίου καταχωρήθηκαν στις 5 Νοεμβρίου - οπότε ΚΑΘΕ
    // ασύνδετο έξοδο έβγαινε «γραμμένο αφού άνοιξε η βάρδια», δηλαδή δικό
    // της και επεξεργάσιμο, και στις ΔΥΟ βάρδιες της ημέρας.
    const typedLongAfter = { shift_id: null, created_at: '2026-11-05T20:50:00Z' } as any;
    const typedLongBefore = { shift_id: null, created_at: '2026-10-01T06:00:00Z' } as any;
    expect(isCarriedExpense(typedLongAfter, SHIFT)).toBe(true);
    expect(isCarriedExpense(typedLongBefore, SHIFT)).toBe(true);
  });

  it('η ίδια βάρδια δεν μπορεί να πάρει έξοδο που δεν έγραψε, όσο κι αν μοιάζει', () => {
    // Δύο βάρδιες που άνοιξαν με δέκα λεπτά διαφορά - έτσι μπαίνει μια μέρα
    // αναδρομικά - δεν μπορούν να διεκδικήσουν και οι δύο το ίδιο έξοδο.
    const expense = { shift_id: null } as any;
    expect(isCarriedExpense(expense, 'morning')).toBe(true);
    expect(isCarriedExpense(expense, 'evening')).toBe(true);
  });
});

// The live failure: a shift worked on 2 September, entered on 19 October, and
// its expenses dated 19 October by CURRENT_DATE. Every day-scoped lookup then
// missed them, so a later shift of 2 September reconciled without them.
describe('which day an expense is filed under', () => {
  const expenseDate = (
    explicit: string | undefined,
    shiftOpenedAt: string | undefined,
    today: string
  ) => explicit || (shiftOpenedAt ? shiftOpenedAt.slice(0, 10) : undefined) || today;

  it('files it under the shift’s day, not the day it was typed', () => {
    expect(expenseDate(undefined, '2026-09-02T13:26:00Z', '2026-10-19')).toBe('2026-09-02');
  });

  it('lets an explicit date win, because somebody chose it', () => {
    expect(expenseDate('2026-08-30', '2026-09-02T13:26:00Z', '2026-10-19')).toBe('2026-08-30');
  });

  it('falls back to today when no shift is open', () => {
    expect(expenseDate(undefined, undefined, '2026-10-19')).toBe('2026-10-19');
  });
});

// ---------------------------------------------------------------------
// Τα έξοδα εταιρίας δεν περνάνε από κανένα ταμείο.
// ---------------------------------------------------------------------
describe('τι έχει δουλειά σε ένα ταμείο', () => {
  const categories: ExpenseCategoryDef[] = [
    { key: 'EXPENSES_GP', label: 'Έξοδα ΓΠ', side: 'AGENCY', sortOrder: 10, isActive: true, isBuiltin: true },
    { key: 'EXPENSES_FNB', label: 'Έξοδα FnB', side: 'FNB', sortOrder: 20, isActive: true, isBuiltin: true },
    { key: 'EXPENSES_COMPANY', label: 'Έξοδα Εταιρίας', side: 'COMPANY', sortOrder: 80, isActive: true, isBuiltin: true },
    { key: 'CUSTOM_EFKA', label: 'ΕΦΚΑ δόσεις', side: 'COMPANY', sortOrder: 90, isActive: true, isBuiltin: false },
  ];

  const day = [
    { id: 'a', category: 'EXPENSES_GP', amount: 40 },
    { id: 'b', category: 'EXPENSES_FNB', amount: 250 },
    { id: 'c', category: 'EXPENSES_COMPANY', amount: 1200 },
    { id: 'd', category: 'CUSTOM_EFKA', amount: 830 },
  ];

  it('αφήνει έξω τα έξοδα εταιρίας, ενσωματωμένα και δικά του', () => {
    expect(tillExpensesOnly(day, categories).map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('το ταμείο δεν χρεώνεται ΕΦΚΑ', () => {
    const charged = tillExpensesOnly(day, categories).reduce((a, e) => a + e.amount, 0);
    expect(charged).toBe(290);
    // Χωρίς τον κανόνα, το ίδιο συρτάρι θα έβγαινε 2.030 € κοντά.
    expect(day.reduce((a, e) => a + e.amount, 0) - charged).toBe(2030);
  });

  it('η πλευρά το αποφασίζει, όχι το όνομα της κατηγορίας', () => {
    // Μια δική του κατηγορία με πλευρά AGENCY μένει στο ταμείο, όσο κι αν
    // το όνομά της μοιάζει εταιρικό.
    const withAgencyRent: ExpenseCategoryDef[] = [
      ...categories,
      { key: 'CUSTOM_PAGIA', label: 'Πάγια Έξοδα', side: 'AGENCY', sortOrder: 95, isActive: true, isBuiltin: false },
    ];
    const rows = [{ id: 'r', category: 'CUSTOM_PAGIA', amount: 2072 }];
    expect(tillExpensesOnly(rows, withAgencyRent).map((e) => e.id)).toEqual(['r']);
  });

  it('χωρίς λίστα κατηγοριών, η ενσωματωμένη εταιρική φεύγει ούτως ή άλλως', () => {
    expect(tillExpensesOnly(day, []).map((e) => e.id)).toEqual(['a', 'b', 'd']);
  });
});
