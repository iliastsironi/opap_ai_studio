/**
 * Βγαίνει το μέτρημα; Η ερώτηση που κάνει ο υπεύθυνος στην επιθεώρηση.
 *
 * Η οθόνη έδειχνε χαρτονομίσματα, κέρματα, κύπελλο - και από κάτω ένα
 * «Σύνολο Καταμέτρησης» που ΔΕΝ ήταν το άθροισμά τους. Στη βραδινή της
 * 10/11 τα κοψίματα έβγαζαν 6.091 € και το αποθηκευμένο σύνολο 6.116 €:
 * 25 € χωρίς καμία γραμμή να τα εξηγεί. Ο ιδιοκτήτης το είδε και ρώτησε
 * «δεν είμαι σίγουρος αν έχει μετρήσει τα 25 € παράδοση κερμάτων».
 *
 * Τα είχε μετρήσει. Ήταν το κύπελλο που έστειλε ο μεσημεριανός: έφυγε από
 * το συρτάρι, αλλά το άνοιγμα της ημέρας το μετράει ακόμα, οπότε η βραδινή
 * το κουβαλάει μέσα στο counted_cash της - αλλιώς θα έβγαινε 25 € μείον
 * για λεφτά που παρέδωσε άλλος. Σωστό, και αόρατο.
 *
 * Αυτή η συνάρτηση γράφει όλες τις γραμμές και λέει αν βγαίνουν. Ό,τι
 * περισσέψει έχει δική του γραμμή και δικό του όνομα: «αδικαιολόγητη
 * διαφορά». Μια επιθεώρηση που δεν αθροίζει μπροστά σου δεν είναι
 * επιθεώρηση.
 */

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

/** Πόσο μακριά επιτρέπεται να πέσει ένα άθροισμα πριν το πούμε διαφορά. */
export const CENT = 0.005;

export interface CountedCashInput {
  /** Χαρτονομίσματα, όπως τα αθροίζουν τα κοψίματα. */
  notes: unknown;
  /** Κέρματα μέσα στο συρτάρι, από τα κοψίματα. */
  coins: unknown;
  /** Το κύπελλο ΑΥΤΗΣ της βάρδιας. */
  ownHandover?: unknown;
  /** Κέρματα που έστειλε νωρίτερα σήμερα άλλη βάρδια. */
  carriedToday?: unknown;
  /** Το αποθηκευμένο counted_cash της βάρδιας - ό,τι λέει η βάση. */
  stored?: unknown;
}

export interface CountedCashLine {
  key: 'NOTES' | 'COINS' | 'OWN_CUP' | 'CARRIED_CUP' | 'UNEXPLAINED';
  label: string;
  amount: number;
  /** Γραμμή που υπάρχει μόνο όταν έχει νόημα να τη δει κανείς. */
  onlyWhenSet: boolean;
  hint?: string;
}

export interface CountedCashAudit {
  lines: CountedCashLine[];
  /** Το άθροισμα των γραμμών, χωρίς την αδικαιολόγητη. */
  computed: number;
  /** Ό,τι λέει η βάση. */
  stored: number;
  /** stored − computed. 0 όταν βγαίνει. */
  unexplained: number;
  balances: boolean;
}

export function auditCountedCash(input: CountedCashInput): CountedCashAudit {
  const notes = round2(num(input.notes));
  const coins = round2(num(input.coins));
  const own = round2(Math.max(0, num(input.ownHandover)));
  const carried = round2(Math.max(0, num(input.carriedToday)));
  const computed = round2(notes + coins + own + carried);

  // Χωρίς αποθηκευμένο σύνολο δεν υπάρχει τίποτα να συγκριθεί, και ένα
  // επινοημένο μηδέν θα κατηγορούσε κάθε βάρδια για ολόκληρο το ταμείο της.
  const hasStored = input.stored !== undefined && input.stored !== null && String(input.stored) !== '';
  const stored = hasStored ? round2(num(input.stored)) : computed;
  const unexplained = round2(stored - computed);

  const lines: CountedCashLine[] = [
    { key: 'NOTES', label: 'Χαρτονομίσματα', amount: notes, onlyWhenSet: false },
    { key: 'COINS', label: 'Κέρματα συρταριού', amount: coins, onlyWhenSet: false },
    {
      key: 'OWN_CUP',
      label: 'Παράδοση κερμάτων αυτής της βάρδιας',
      amount: own,
      onlyWhenSet: false,
      hint: 'Έφυγε με τον φάκελο· μετριέται εδώ γιατί ήταν λεφτά της βάρδιας.',
    },
    {
      key: 'CARRIED_CUP',
      label: 'Κέρματα που παραδόθηκαν νωρίτερα σήμερα',
      amount: carried,
      onlyWhenSet: true,
      hint: 'Τα έστειλε προηγούμενη βάρδια. Το άνοιγμα της ημέρας τα μετράει ακόμα, γι’ αυτά δεν παραδίδονται ξανά.',
    },
  ];

  if (Math.abs(unexplained) > CENT) {
    lines.push({
      key: 'UNEXPLAINED',
      label: 'Αδικαιολόγητη διαφορά',
      amount: unexplained,
      onlyWhenSet: true,
      hint: 'Το αποθηκευμένο σύνολο δεν συμφωνεί με τις γραμμές από πάνω. Αυτό θέλει έλεγχο.',
    });
  }

  return { lines, computed, stored, unexplained, balances: Math.abs(unexplained) <= CENT };
}
