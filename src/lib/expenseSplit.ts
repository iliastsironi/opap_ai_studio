/**
 * Ποια από τα έξοδα της βάρδιας είναι του καφέ.
 *
 * Η επιθεώρηση έδειχνε δύο γραμμές, «Έξοδα ΓΠ» και «Έξοδα FnB», και η
 * δεύτερη έγραφε 0,00 € σε ΚΑΘΕ βάρδια. Στη βραδινή της 10/11, από τα
 * 160,15 € που μετρούσε το ταμείο, τα 55,60 € ήταν του κυλικείου - πάγος
 * και κάβα - και εμφανίζονταν ολόκληρα στο πρακτορείο.
 *
 * Ο λόγος: ο διαχωρισμός διαβαζόταν από τα `expenses_gp_cash` /
 * `expenses_fnb_cash` των custom_field_values, που ΔΕΝ τα γράφει κανένα
 * κλείσιμο. Και στις 103 βάρδιες της βάσης είναι και τα δύο κενά, οπότε το
 * `?? expenses_paid_cash` έστελνε τα πάντα στο ΓΠ και το FnB έμενε μηδέν.
 *
 * Η απάντηση υπάρχει στις ίδιες τις γραμμές των εξόδων, μέσα από το
 * isFnbCategory - τη ΜΟΝΗ απάντηση στην ερώτηση «είναι του καφέ;» σε όλο
 * το έργο, που σέβεται και τις κατηγορίες που έφτιαξε ο ιδιοκτήτης.
 *
 * ΤΟ ΣΥΝΟΛΟ ΔΕΝ ΑΛΛΑΖΕΙ ΠΟΤΕ. Το ΓΠ βγαίνει ως «σύνολο μείον καφές», ώστε
 * ο,τι κι αν λένε οι γραμμές, το άθροισμα των δύο να παραμένει ακριβώς το
 * ποσό που μέτρησε το ταμείο - αλλιώς θα είχα διορθώσει μια ετικέτα και θα
 * είχα χαλάσει μια συμφωνία.
 */

import { CENT } from './countedCashAudit.ts';
import { isFnbCategory, type ExpenseCategoryDef } from './expenseCategories.ts';

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

const isSet = (v: unknown): boolean => v !== undefined && v !== null && String(v) !== '';

export interface SplittableExpense {
  amount?: unknown;
  category?: unknown;
  payment_method?: unknown;
}

export type ExpenseSplitSource = 'STORED' | 'LINES' | 'UNSPLIT';

export interface ExpenseSplit {
  /** Ό,τι βαραίνει το πρακτορείο. */
  gp: number;
  /** Ό,τι βαραίνει τον καφέ. */
  fnb: number;
  /** gp + fnb, πάντα ίσο με το ποσό που μετρήθηκε. */
  total: number;
  source: ExpenseSplitSource;
  /** Αθροίζουν οι γραμμές που ξέρουμε στο σύνολο της βάρδιας; */
  linesMatchTotal: boolean;
}

/**
 * Βγήκε από το συρτάρι;
 *
 * «Ό,τι δεν είναι κάρτα», ακριβώς όπως το μετράει το κλείσιμο όταν φτιάχνει
 * το σύνολο (ShiftClosingWizard: `exp.payment_method !== 'CARD'`). Με «μόνο
 * CASH» εδώ, ένα έξοδο του καφέ πληρωμένο με πίστωση θα μετριόταν στο
 * σύνολο αλλά όχι στον καφέ, και θα προσγειωνόταν σιωπηλά στο πρακτορείο.
 * Σήμερα και τα 134 έξοδα της βάσης είναι CASH· η διαφορά θα φαινόταν την
 * πρώτη φορά που κάποιος έγραφε πίστωση, που είναι η χειρότερη στιγμή να
 * ανακαλύπτεις ότι δύο οθόνες μετράνε αλλιώς.
 *
 * Χωρίς δηλωμένο τρόπο πληρωμής μετράει ως μετρητά - ό,τι ίσχυε πριν
 * υπάρξει η στήλη.
 */
const isCash = (e: SplittableExpense): boolean =>
  !isSet(e.payment_method) || String(e.payment_method).toUpperCase() !== 'CARD';

export function splitShiftExpenses(input: {
  /** Το σύνολο μετρητών που μέτρησε η συμφωνία ταμείου. */
  total?: unknown;
  storedGp?: unknown;
  storedFnb?: unknown;
  /** Οι γραμμές εξόδων που μέτρησε η βάρδια - δικές της και κληρονομημένες. */
  rows?: readonly SplittableExpense[] | null;
  categories?: readonly ExpenseCategoryDef[];
}): ExpenseSplit {
  // Αν κάποτε το κλείσιμο αρχίσει να γράφει τον διαχωρισμό, αυτός κερδίζει:
  // είναι ό,τι είδε και υπέγραψε ο υπάλληλος.
  if (isSet(input.storedGp)) {
    const gp = round2(num(input.storedGp));
    const fnb = round2(num(input.storedFnb));
    return { gp, fnb, total: round2(gp + fnb), source: 'STORED', linesMatchTotal: true };
  }

  const total = round2(num(input.total));
  const rows = Array.isArray(input.rows) ? input.rows.filter(isCash) : [];

  if (rows.length === 0) {
    return { gp: total, fnb: 0, total, source: 'UNSPLIT', linesMatchTotal: false };
  }

  const linesTotal = round2(rows.reduce((acc, e) => acc + num(e.amount), 0));
  const fnbLines = round2(
    rows.reduce((acc, e) => (isFnbCategory(e.category, input.categories) ? acc + num(e.amount) : acc), 0)
  );

  // Ποτέ πάνω από το σύνολο και ποτέ κάτω από το μηδέν: το ΓΠ βγαίνει ως
  // υπόλοιπο, και ένα αρνητικό ΓΠ θα ήταν χειρότερο από το πρόβλημα.
  const fnb = round2(Math.min(Math.max(fnbLines, 0), Math.max(total, 0)));
  const gp = round2(total - fnb);

  return {
    gp,
    fnb,
    total,
    source: 'LINES',
    linesMatchTotal: Math.abs(linesTotal - total) <= CENT,
  };
}
