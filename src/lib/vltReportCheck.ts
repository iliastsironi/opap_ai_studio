/**
 * Διασταύρωση των μετρητών στα VLTs με το report του portal.
 *
 * Ο πράκτορας: «δεν μπορούμε να ελέγξουμε τα λεφτά που μπαίνουν μέσα στα
 * μηχανάκια, παίρνουμε ένα report μετά από 1-2 μέρες· αυτό στο ταμείο δεν
 * μπορείς να το βάλεις live». Το report γράφεται μία φορά ανά ημέρα, ως ένα
 * νούμερο, και η εφαρμογή το βάζει δίπλα στο νούμερο που έχουν γράψει οι
 * βάρδιες - και ειδοποιεί αν διαφέρουν.
 *
 * ΠΟΙΟ ΝΟΥΜΕΡΟ ΤΩΝ ΒΑΡΔΙΩΝ. Το «Μετρητά στα VLTs» (shifts.vlts_cash_in) είναι
 * αθροιστικό μέσα στην ημέρα, όπως κάθε νούμερο της αναφοράς μιας βάρδιας:
 * η βραδινή γράφει το σύνολο της ημέρας, όχι μόνο τις δικές της ώρες. Γι' αυτό
 * η σύγκριση γίνεται με την ΤΕΛΕΥΤΑΙΑ βάρδια της ημέρας και όχι με το άθροισμα
 * (0040: «a day is its LAST shift») - ο ίδιος κανόνας με το
 * dailyAggregationService. Ανά ταμείο, γιατί δύο ταμεία είναι δύο ανεξάρτητα
 * τρέχοντα σύνολα, και μετά αθροίζονται στο κατάστημα.
 *
 * ΜΟΝΟ ΟΤΑΝ ΕΧΟΥΝ ΚΛΕΙΣΕΙ ΟΛΕΣ. Όσο μια βάρδια της ημέρας είναι ανοιχτή, σε
 * κλείσιμο ή σε διόρθωση, το σύνολο της ημέρας δεν είναι τελικό, και μια
 * σύγκριση τότε θα έβγαζε ψεύτικη διαφορά. Δεν ειδοποιεί, το λέει.
 *
 * Σε λεπτά, με ακέραιους: το 0,1 + 0,2 των δεκαδικών δεν πρέπει να βγάζει
 * διαφορά σε ένα ταμείο που ταιριάζει.
 */

import { athensDateKey } from './pnlEngine.ts';

/** Οι καταστάσεις βάρδιας που σημαίνουν «το σύνολο της ημέρας είναι τελικό». */
export const FINAL_SHIFT_STATUSES: ReadonlyArray<string> = ['SUBMITTED', 'APPROVED'];

export interface VltShiftInput {
  id?: string;
  store_id: string;
  register_id?: string | null;
  opened_at: string;
  status: string;
  vlts_cash_in?: unknown;
  vlts_cash_out?: unknown;
}

export interface VltReportInput {
  id?: string;
  store_id: string;
  /** YYYY-MM-DD */
  report_date: string;
  amount: unknown;
  note?: string | null;
  /** Η διαφορά που εγκρίθηκε από υπεύθυνο, ή null/άγραφη (0090). */
  approved_difference?: unknown;
  approved_at?: string | null;
  approved_by_name?: string | null;
}

/** Μια εγκεκριμένη διαφορά: ποιος, πότε, και ποια διαφορά ακριβώς. */
export interface VltApproval {
  /** Η διαφορά που εγκρίθηκε, σε ευρώ. */
  amount: number;
  by: string | null;
  at: string | null;
}

export type VltDayStatus =
  /** Ίδια νούμερα. */
  | 'MATCH'
  /** Διαφέρουν - αυτό ειδοποιεί. */
  | 'DIFFERENT'
  /** Οι βάρδιες έγραψαν νούμερο, το report δεν έχει έρθει ακόμα. */
  | 'AWAITING_REPORT'
  /** Υπάρχει report, αλλά μια βάρδια της ημέρας δεν έχει κλείσει ακόμα. */
  | 'SHIFTS_OPEN';

export interface VltDayRow {
  /** `${storeId}|${date}` - ταυτότητα της γραμμής. */
  key: string;
  storeId: string;
  /** YYYY-MM-DD, ημέρα Αθήνας. */
  date: string;
  /** Το νούμερο των βαρδιών, σε ευρώ. */
  shiftsAmount: number;
  shiftCount: number;
  /** Έχουν κλείσει όλες οι βάρδιες της ημέρας; Χωρίς βάρδιες: ναι. */
  shiftsFinal: boolean;
  /** Το report, ή null αν δεν έχει καταχωρηθεί. */
  report: number | null;
  reportId: string | null;
  note: string | null;
  /** report − βάρδιες, σε ευρώ· null όταν δεν υπάρχει τίποτα να συγκριθεί. */
  difference: number | null;
  status: VltDayStatus;
  /**
   * Η έγκριση της διαφοράς από υπεύθυνο, ΜΟΝΟ όταν ισχύει ακόμα: η εγκεκριμένη
   * διαφορά είναι ίση με την τρέχουσα. Αν άλλαξε το report ή μια βάρδια και η διαφορά
   * είναι άλλη, είναι null - μια έγκριση δεν μεταφέρεται σε διαφορετικά νούμερα.
   */
  approval: VltApproval | null;
}

/**
 * Ό,τι πληκτρολογήθηκε, όπως το διαβάζει και το safeNum: στα ελληνικά το κείμενο
 * λέει «1563,5», και το Number() το κάνει NaN - δηλαδή μηδέν.
 */
const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const parsed = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toCents = (euros: unknown): number => Math.round(num(euros) * 100);
const fromCents = (cents: number): number => cents / 100 + 0;

/** Το πρώτο ταμείο, όταν η βάρδια δεν λέει ποιο - όπως στο dailyAggregationService. */
const DEFAULT_REGISTER = 'Ταμείο 1';

/**
 * Σύγκριση μιας ημέρας. Ξεχωριστή και καθαρή, ώστε ο κανόνας να ελέγχεται χωρίς
 * βάρδιες και χωρίς οθόνη.
 */
export function compareVltDay(input: {
  shiftsAmount: number;
  shiftsFinal: boolean;
  report: number | null;
}): { status: VltDayStatus; difference: number | null } {
  if (input.report === null) return { status: 'AWAITING_REPORT', difference: null };
  // Η διαφορά φαίνεται ακόμα κι όταν δεν ειδοποιεί, για να δει ο χρήστης πού βρίσκεται.
  const diffCents = toCents(input.report) - toCents(input.shiftsAmount);
  const difference = fromCents(diffCents);
  if (!input.shiftsFinal) return { status: 'SHIFTS_OPEN', difference };
  return { status: diffCents === 0 ? 'MATCH' : 'DIFFERENT', difference };
}

const keyOf = (storeId: string, date: string) => `${storeId}|${date}`;

/**
 * Οι γραμμές του ελέγχου: μία ανά (κατάστημα, ημέρα) που έχει βάρδιες ή report.
 *
 * Μπαίνουν ΜΟΝΟ καταστήματα που έχουν κίνηση VLT (κάποια βάρδια με μετρητά ή ροή
 * VLT, ή κάποιο report). Ένα κατάστημα χωρίς VLT θα γέμιζε τον πίνακα με μηδενικά
 * που περιμένουν ένα report που δεν θα έρθει ποτέ.
 *
 * Ένα report για ημέρα χωρίς καμία βάρδια ΔΕΝ κρύβεται: το portal λέει ότι
 * μπήκαν χρήματα στα μηχανήματα, και οι βάρδιες λένε μηδέν - αυτό είναι ακριβώς η
 * διαφορά που ψάχνουμε.
 */
export function buildVltDayRows(input: {
  shifts: ReadonlyArray<VltShiftInput>;
  reports: ReadonlyArray<VltReportInput>;
}): VltDayRow[] {
  // 1. Οι βάρδιες ανά κατάστημα και ημέρα.
  const byDay = new Map<string, { storeId: string; date: string; shifts: VltShiftInput[] }>();
  const vltStores = new Set<string>();
  for (const s of input.shifts) {
    const date = athensDateKey(s.opened_at);
    const key = keyOf(s.store_id, date);
    const group = byDay.get(key) ?? { storeId: s.store_id, date, shifts: [] };
    group.shifts.push(s);
    byDay.set(key, group);
    if (toCents(s.vlts_cash_in) !== 0 || toCents(s.vlts_cash_out) !== 0) vltStores.add(s.store_id);
  }

  // 2. Τα reports ανά κατάστημα και ημέρα.
  const reportByKey = new Map<string, VltReportInput>();
  for (const r of input.reports) {
    reportByKey.set(keyOf(r.store_id, r.report_date), r);
    vltStores.add(r.store_id);
  }

  const keys = new Set<string>();
  for (const [key, g] of byDay) if (vltStores.has(g.storeId)) keys.add(key);
  for (const key of reportByKey.keys()) keys.add(key);

  const rows: VltDayRow[] = [];
  for (const key of keys) {
    const group = byDay.get(key);
    const report = reportByKey.get(key) ?? null;
    const [storeId, date] = key.split('|');

    // Το σύνολο της ημέρας = το τελευταίο νούμερο κάθε ταμείου, αθροισμένα.
    // Ισοπαλία στην ώρα ανοίγματος: κερδίζει η μεταγενέστερη εγγραφή της λίστας,
    // όπως στο dailyAggregationService.
    const lastPerRegister = new Map<string, VltShiftInput>();
    for (const s of group?.shifts ?? []) {
      const register = s.register_id || DEFAULT_REGISTER;
      const current = lastPerRegister.get(register);
      if (!current || new Date(s.opened_at).getTime() >= new Date(current.opened_at).getTime()) {
        lastPerRegister.set(register, s);
      }
    }
    const shiftsCents = [...lastPerRegister.values()].reduce((t, s) => t + toCents(s.vlts_cash_in), 0);
    const shiftsFinal = (group?.shifts ?? []).every((s) => FINAL_SHIFT_STATUSES.includes(s.status));
    const shiftsAmount = fromCents(shiftsCents);
    const reportAmount = report ? fromCents(toCents(report.amount)) : null;

    const { status, difference } = compareVltDay({ shiftsAmount, shiftsFinal, report: reportAmount });

    // Εγκεκριμένη μόνο αν υπάρχει διαφορά ΚΑΙ είναι ακριβώς αυτή που εγκρίθηκε, σε λεπτά.
    const approvedRaw = report?.approved_difference;
    const hasApproval = approvedRaw !== null && approvedRaw !== undefined && approvedRaw !== '';
    const approval: VltApproval | null =
      status === 'DIFFERENT' && hasApproval && difference !== null && toCents(approvedRaw) === toCents(difference)
        ? { amount: fromCents(toCents(approvedRaw)), by: report?.approved_by_name ?? null, at: report?.approved_at ?? null }
        : null;

    rows.push({
      key,
      storeId,
      date,
      shiftsAmount,
      shiftCount: group?.shifts.length ?? 0,
      shiftsFinal,
      report: reportAmount,
      reportId: report?.id ?? null,
      note: report?.note ?? null,
      difference,
      status,
      approval,
    });
  }

  // Η πιο πρόσφατη ημέρα πρώτη· στην ίδια ημέρα, με σταθερή σειρά καταστημάτων.
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.storeId.localeCompare(b.storeId));
}

/**
 * Οι γραμμές που ειδοποιούν: οι διαφορές που ΔΕΝ έχουν εγκριθεί. Μια εγκεκριμένη διαφορά
 * δεν βγάζει πια το κόκκινο notice πάνω ούτε μετράει στην ένδειξη της καρτέλας - αλλά η
 * γραμμή της μένει κοκκινισμένη, με τικ, γιατί το ποσό ακόμα δεν βγήκε.
 */
export function vltMismatches(rows: ReadonlyArray<VltDayRow>): VltDayRow[] {
  return rows.filter((r) => r.status === 'DIFFERENT' && !r.approval);
}

/** Μια ημερομηνία κλειδί (YYYY-MM-DD) μετατοπισμένη κατά n ημέρες. */
export function shiftDateKey(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
