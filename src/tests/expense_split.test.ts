import { describe, it, expect } from 'vitest';
import { splitShiftExpenses } from '../lib/expenseSplit';
import { BUILTIN_EXPENSE_CATEGORIES, type ExpenseCategoryDef } from '../lib/expenseCategories';

/**
 * Η βραδινή της 10/11 στη Λαμία. Το ταμείο μέτρησε 160,15 € έξοδα: 33 €
 * δικά της και 127,15 € που κουβάλησε από την πρωινή. Από αυτά, πάγος και
 * κάβα - 55,60 € - είναι του κυλικείου.
 */
const LAMIA_NIGHT_ROWS = [
  { amount: 33.0, category: 'OTHER', payment_method: 'CASH' },
  { amount: 57.55, category: 'MAINTENANCE', payment_method: 'CASH' },
  { amount: 9.6, category: 'EXPENSES_FNB', payment_method: 'CASH' },
  { amount: 46.0, category: 'EXPENSES_FNB', payment_method: 'CASH' },
  { amount: 14.0, category: 'EXPENSES_GP', payment_method: 'CASH' },
];

describe('splitShiftExpenses', () => {
  it('βγάζει τα έξοδα του καφέ από τις γραμμές', () => {
    const s = splitShiftExpenses({ total: 160.15, rows: LAMIA_NIGHT_ROWS, categories: BUILTIN_EXPENSE_CATEGORIES });
    expect(s.fnb).toBe(55.6);
    expect(s.gp).toBe(104.55);
    expect(s.source).toBe('LINES');
  });

  it('ΤΟ ΣΥΝΟΛΟ ΔΕΝ ΑΛΛΑΖΕΙ — ΓΠ + FnB = ό,τι μέτρησε το ταμείο', () => {
    const s = splitShiftExpenses({ total: 160.15, rows: LAMIA_NIGHT_ROWS, categories: BUILTIN_EXPENSE_CATEGORIES });
    expect(s.gp + s.fnb).toBeCloseTo(160.15, 2);
    expect(s.total).toBe(160.15);
  });

  it('λέει ότι οι γραμμές αθροίζουν στο σύνολο', () => {
    const s = splitShiftExpenses({ total: 160.15, rows: LAMIA_NIGHT_ROWS, categories: BUILTIN_EXPENSE_CATEGORIES });
    expect(s.linesMatchTotal).toBe(true);
  });

  it('το σύνολο μένει ακέραιο ακόμα κι όταν οι γραμμές δεν το καλύπτουν', () => {
    const s = splitShiftExpenses({ total: 200, rows: LAMIA_NIGHT_ROWS, categories: BUILTIN_EXPENSE_CATEGORIES });
    expect(s.fnb).toBe(55.6);
    expect(s.gp).toBe(144.4);
    expect(s.gp + s.fnb).toBeCloseTo(200, 2);
    expect(s.linesMatchTotal).toBe(false);
  });

  it('χωρίς γραμμές δεν μαντεύει — όλα στο ΓΠ, όπως πριν', () => {
    const s = splitShiftExpenses({ total: 160.15, rows: [] });
    expect(s.gp).toBe(160.15);
    expect(s.fnb).toBe(0);
    expect(s.source).toBe('UNSPLIT');
  });

  it('τα έξοδα με κάρτα δεν βγήκαν από το συρτάρι', () => {
    const s = splitShiftExpenses({
      total: 100,
      rows: [
        { amount: 40, category: 'EXPENSES_FNB', payment_method: 'CARD' },
        { amount: 25, category: 'EXPENSES_FNB', payment_method: 'CASH' },
      ],
      categories: BUILTIN_EXPENSE_CATEGORIES,
    });
    expect(s.fnb).toBe(25);
    expect(s.gp).toBe(75);
  });

  /**
   * Το κλείσιμο μετράει στο σύνολο ό,τι δεν είναι κάρτα. Αν εδώ μετρούσαμε
   * μόνο το CASH, ένα έξοδο του καφέ με πίστωση θα έμπαινε στο σύνολο και
   * θα προσγειωνόταν στο πρακτορείο.
   */
  it('η πίστωση βγήκε από το συρτάρι, όπως το μετράει και το κλείσιμο', () => {
    const s = splitShiftExpenses({
      total: 100,
      rows: [{ amount: 30, category: 'EXPENSES_FNB', payment_method: 'CREDIT' }],
      categories: BUILTIN_EXPENSE_CATEGORIES,
    });
    expect(s.fnb).toBe(30);
    expect(s.gp).toBe(70);
  });

  it('χωρίς δηλωμένο τρόπο πληρωμής μετράει ως μετρητά', () => {
    const s = splitShiftExpenses({ total: 50, rows: [{ amount: 20, category: 'EXPENSES_FNB' }], categories: BUILTIN_EXPENSE_CATEGORIES });
    expect(s.fnb).toBe(20);
  });

  /**
   * Από το 0074 ο ιδιοκτήτης ονομάζει μόνος του τις κατηγορίες. Μια δική
   * του κατηγορία του καφέ πρέπει να μετράει στον καφέ - αλλιώς το
   * περιθώριο του κυλικείου γίνεται λάθος σιωπηλά.
   */
  it('σέβεται κατηγορία καφέ που έφτιαξε ο ιδιοκτήτης', () => {
    const own: ExpenseCategoryDef[] = [
      ...BUILTIN_EXPENSE_CATEGORIES,
      { key: 'CUSTOM_KAFES', label: 'Καφές', side: 'FNB', sortOrder: 90, isActive: true, isBuiltin: false },
    ];
    const s = splitShiftExpenses({ total: 100, rows: [{ amount: 30, category: 'CUSTOM_KAFES' }], categories: own });
    expect(s.fnb).toBe(30);
    expect(s.gp).toBe(70);
  });

  it('το ΓΠ δεν γίνεται ποτέ αρνητικό', () => {
    const s = splitShiftExpenses({
      total: 10,
      rows: [{ amount: 90, category: 'EXPENSES_FNB' }],
      categories: BUILTIN_EXPENSE_CATEGORIES,
    });
    expect(s.fnb).toBe(10);
    expect(s.gp).toBe(0);
  });

  it('ένας αποθηκευμένος διαχωρισμός κερδίζει από τις γραμμές', () => {
    const s = splitShiftExpenses({
      total: 999,
      storedGp: 104.55,
      storedFnb: 55.6,
      rows: LAMIA_NIGHT_ROWS,
      categories: BUILTIN_EXPENSE_CATEGORIES,
    });
    expect(s.source).toBe('STORED');
    expect(s.gp).toBe(104.55);
    expect(s.fnb).toBe(55.6);
    expect(s.total).toBe(160.15);
  });

  it('διαβάζει ποσό γραμμένο με ελληνικό κόμμα', () => {
    const s = splitShiftExpenses({
      total: '100,50',
      rows: [{ amount: '9,60', category: 'EXPENSES_FNB' }],
      categories: BUILTIN_EXPENSE_CATEGORIES,
    });
    expect(s.fnb).toBe(9.6);
    expect(s.gp).toBe(90.9);
  });
});
