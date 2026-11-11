/**
 * Βγαίνει η αριστερή στήλη της επιθεώρησης; Μέχρι τώρα όχι.
 *
 * Η οθόνη έδειχνε έξι κουτάκια - ΟΠΑΠ, VLTs, Λαχεία, TORA, FnB, POS - και
 * από κάτω μια μπλε μπάρα «Σύνολο Ταμείου (Αναφορές)». Στη βραδινή της
 * 10/11 τα κουτάκια έβγαζαν 2.589,79 € και η μπάρα 5.673,99 €. Τρία
 * ξεχωριστά λάθη, το καθένα αρκετό από μόνο του:
 *
 * 1. Το `opap_gross_sales` που αποθηκεύεται ΔΕΝ είναι τα αριθμοπαιχνίδια.
 *    Είναι σύνθετο: `arithmo_gross − arithmo_cancels + pame_stoixima +
 *    clever_point + ippodromos` (ShiftClosingWizard, opapGrossTotal). Οπότε
 *    το Πάμε Στοίχημα, ο Ιππόδρομος και το Clever ήταν κρυμμένα μέσα στο
 *    «Καθαρά» του ΟΠΑΠ, χωρίς δική τους γραμμή - και όποια οθόνη τα
 *    πρόσθετε ξανά τα μέτραγε δύο φορές.
 * 2. Τα σκρατς έδειχναν «Πωλήσεις 0,00» γιατί διάβαζαν `scratch_sales`, που
 *    δεν γράφεται ποτέ. Ο μικτός ζει στο `scratch_gross_sales` - 582 € σε
 *    εκείνη τη βάρδια - και ο καθαρός στο `scratch_lotto_sales`.
 * 3. Το TORA POS έβγαινε ΑΦΑΙΡΕΣΗ, −1.251,10 €, ενώ ο τύπος που έγραψε το
 *    αποθηκευμένο σύνολο το ΠΡΟΣΘΕΤΕΙ. Λάθος πρόσημο σε τετραψήφιο ποσό.
 *
 * Αυτή η συνάρτηση γράφει τους όρους του τύπου που ΟΝΤΩΣ παρήγαγε το
 * `expected_cash`, διαβάζοντας μόνο ωμές αποθηκευμένες στήλες. Σε όλες τις
 * 102 κλεισμένες βάρδιες του πρακτορείου αναπαράγει το αποθηκευμένο ποσό
 * στο λεπτό, 102/102. Ό,τι περισσέψει παίρνει δική του γραμμή και δικό του
 * όνομα, όπως στο [[countedCashAudit]]: μια επιθεώρηση που δεν αθροίζει
 * μπροστά σου δεν είναι επιθεώρηση.
 */

import { CENT } from './countedCashAudit';

/**
 * Ελληνικό πληκτρολόγιο: το υποδιαστολικό είναι κόμμα, και τα ποσά που
 * πληκτρολογεί ο υπάλληλος αποθηκεύονται όπως γράφτηκαν - «117,22». Το
 * `parseFloat` σταματάει στο κόμμα και δίνει 117, δηλαδή τρώει τα λεπτά.
 * Σε 97 από τις 102 βάρδιες του πρακτορείου υπήρχε τουλάχιστον ένα τέτοιο
 * ποσό, και η στήλη έβγαινε μέχρι 99 λεπτά κοντή για αυτόν τον λόγο μόνο.
 * Ίδιος κανόνας με το safeNum του financialCalculator.
 */
const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

/** Υπάρχει απάντηση, ακόμα κι αν είναι μηδέν. */
const isSet = (v: unknown): boolean =>
  v !== undefined && v !== null && String(v) !== '';

/**
 * Το πρώτο πεδίο που απάντησε. Όχι `||`, γιατί ένα πραγματικό 0 είναι
 * απάντηση: βάρδια που μέτρησε τον ιππόδρομο και τον βρήκε στο μηδέν δεν
 * πρέπει να πέσει στο alias.
 */
const first = (...vals: unknown[]): number => {
  for (const v of vals) if (isSet(v)) return num(v);
  return 0;
};

export type ReportsLineKey =
  | 'GAMES_SALES'
  | 'GAMES_PAYOUTS'
  | 'GAMES_VOUCHERS'
  | 'GAMES_CANCELS'
  | 'PAME'
  | 'CLEVER'
  | 'IPPODROMOS'
  | 'SCRATCH'
  | 'TORA'
  | 'VLTS'
  | 'FNB'
  | 'UNEXPLAINED';

export interface ReportsLine {
  key: ReportsLineKey;
  label: string;
  /** Με πρόσημο, όπως μπαίνει στο άθροισμα. */
  amount: number;
  /** Γραμμή που εμφανίζεται μόνο όταν έχει νόημα να τη δει κανείς. */
  onlyWhenSet: boolean;
  hint?: string;
}

export interface ReportsAudit {
  lines: ReportsLine[];
  /** Το άθροισμα των γραμμών, χωρίς την αδικαιολόγητη. */
  computed: number;
  /** Ό,τι λέει η βάση στο `expected_cash`. */
  stored: number;
  /** stored − computed. 0 όταν βγαίνει. */
  unexplained: number;
  balances: boolean;
}

/** Τα πεδία που διαβάζει - όλα αποθηκευμένες στήλες ή custom_field_values. */
export interface ReportsAuditInput {
  number_games_sales?: unknown;
  number_games_payouts?: unknown;
  number_games_vouchers?: unknown;
  number_games_cancellations?: unknown;
  arithmo_gross?: unknown;
  arithmo_payouts?: unknown;
  arithmo_vouchers?: unknown;
  arithmo_cancels?: unknown;
  pame_stoixima?: unknown;
  pame_stoixima_balance?: unknown;
  clever_point?: unknown;
  ippodromos?: unknown;
  ippodromos_balance?: unknown;
  scratch_lotto_sales?: unknown;
  tora_total?: unknown;
  vlts_net?: unknown;
  vlts_cash_in?: unknown;
  vlts_cash_out?: unknown;
  fnb_cash?: unknown;
  fnb_sales?: unknown;
  fnb_card?: unknown;
  expected_cash?: unknown;
  custom_field_values?: {
    tora_pos_items?: Array<{ amount?: unknown }> | null;
  } | null;
  tora_pos_items?: Array<{ amount?: unknown }> | null;
}

/**
 * Το TORA POS, όπως το μέτρησε το κλείσιμο: το άθροισμα των γραμμών που
 * πληκτρολόγησε ο υπάλληλος. Το `tora_total` είναι το ίδιο ποσό σε στήλη
 * και κρατιέται ως δίχτυ για βάρδια που έσβησε τις γραμμές της.
 */
export function toraPosTotal(input: ReportsAuditInput): number {
  const items = input.tora_pos_items ?? input.custom_field_values?.tora_pos_items ?? [];
  if (Array.isArray(items) && items.length > 0) {
    return round2(items.reduce((acc, item) => acc + num(item?.amount), 0));
  }
  return round2(num(input.tora_total));
}

/**
 * Τα VLTs καθαρά. Το `vlts_cash_out` αποθηκεύεται ήδη αρνητικό, γι' αυτό
 * προστίθεται - η ίδια σύμβαση με το resolveVltNet του financialCalculator.
 */
function vltNet(input: ReportsAuditInput): number {
  if (isSet(input.vlts_net)) return round2(num(input.vlts_net));
  return round2(num(input.vlts_cash_in) + num(input.vlts_cash_out));
}

/**
 * Πόσα από τον καφέ είναι όντως στο συρτάρι. Ίδιος κανόνας με το
 * resolveFnbCash: όταν τα μετρητά είναι μηδέν, ό,τι δηλώθηκε συνολικά
 * μείον τις κάρτες.
 */
function fnbCashInDrawer(input: ReportsAuditInput): number {
  const cash = num(input.fnb_cash);
  if (cash !== 0) return round2(cash);
  return round2(Math.max(0, num(input.fnb_sales) - num(input.fnb_card)));
}

export function auditExpectedCash(input: ReportsAuditInput): ReportsAudit {
  // Ωμά αριθμοπαιχνίδια. Τα `number_games_*` είναι ο κανόνας, τα
  // `arithmo_*` το δίχτυ για παλιότερες βάρδιες. ΟΧΙ το opap_gross_sales:
  // εκείνο είναι το σύνθετο που κρύβει το Πάμε Στοίχημα μέσα του.
  const sales = round2(first(input.number_games_sales, input.arithmo_gross));
  const payouts = round2(first(input.number_games_payouts, input.arithmo_payouts));
  const vouchers = round2(first(input.number_games_vouchers, input.arithmo_vouchers));
  const cancels = round2(first(input.number_games_cancellations, input.arithmo_cancels));

  const pame = round2(first(input.pame_stoixima, input.pame_stoixima_balance));
  const clever = round2(num(input.clever_point));
  const ippodromos = round2(first(input.ippodromos, input.ippodromos_balance));
  const scratch = round2(num(input.scratch_lotto_sales));
  const tora = toraPosTotal(input);
  const vlts = vltNet(input);
  const fnb = fnbCashInDrawer(input);

  const lines: ReportsLine[] = [
    {
      key: 'GAMES_SALES',
      label: 'Αριθμοπαιχνίδια — πωλήσεις',
      amount: sales,
      onlyWhenSet: false,
    },
    {
      key: 'GAMES_PAYOUTS',
      label: 'Αριθμοπαιχνίδια — πληρωμές',
      amount: -payouts,
      onlyWhenSet: false,
    },
    {
      key: 'GAMES_VOUCHERS',
      label: 'Κουπόνια',
      amount: vouchers,
      onlyWhenSet: true,
      hint: 'Κουπόνια που δέχτηκε το ταμείο· προσθέτουν στο αναμενόμενο.',
    },
    {
      key: 'GAMES_CANCELS',
      label: 'Ακυρώσεις',
      amount: -cancels,
      onlyWhenSet: true,
    },
    {
      key: 'PAME',
      label: 'Πάμε Στοίχημα',
      amount: pame,
      onlyWhenSet: true,
      hint: 'Μέσα στο μικτό ΟΠΑΠ που αποθηκεύεται· εδώ έχει δική του γραμμή ώστε να μη μετρηθεί δύο φορές.',
    },
    { key: 'CLEVER', label: 'Clever Point', amount: clever, onlyWhenSet: true },
    { key: 'IPPODROMOS', label: 'Ιππόδρομος', amount: ippodromos, onlyWhenSet: true },
    {
      key: 'SCRATCH',
      label: 'Λαχεία & Σκρατς (καθαρά)',
      amount: scratch,
      onlyWhenSet: false,
      hint: 'Πωλήσεις μείον εξαργυρώσεις, όπως τα μέτρησε το κλείσιμο.',
    },
    {
      key: 'TORA',
      label: 'TORA DIRECT (POS)',
      amount: tora,
      onlyWhenSet: false,
      hint: 'Εισπράξεις λογαριασμών. Προσθέτουν στο αναμενόμενο ταμείο — δεν αφαιρούνται.',
    },
    { key: 'VLTS', label: 'VLTs (καθαρά)', amount: vlts, onlyWhenSet: false },
    { key: 'FNB', label: 'FnB μετρητά', amount: fnb, onlyWhenSet: false },
  ];

  const computed = round2(lines.reduce((acc, l) => acc + l.amount, 0));

  // Χωρίς αποθηκευμένο σύνολο δεν υπάρχει τίποτα να συγκριθεί, και ένα
  // επινοημένο μηδέν θα κατηγορούσε κάθε βάρδια για ολόκληρο το ταμείο της.
  const stored = isSet(input.expected_cash) ? round2(num(input.expected_cash)) : computed;
  const unexplained = round2(stored - computed);

  if (Math.abs(unexplained) > CENT) {
    lines.push({
      key: 'UNEXPLAINED',
      label: 'Αδικαιολόγητη διαφορά',
      amount: unexplained,
      onlyWhenSet: true,
      hint: 'Το αποθηκευμένο «Σύνολο Ταμείου» δεν συμφωνεί με τις γραμμές από πάνω. Αυτό θέλει έλεγχο.',
    });
  }

  return { lines, computed, stored, unexplained, balances: Math.abs(unexplained) <= CENT };
}
