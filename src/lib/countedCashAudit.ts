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

/**
 * Και το ΜΙΚΤΟ της καταμέτρησης, με τον ίδιο κανόνα.
 *
 * Κάτω από τις γραμμές του μετρήματος η στήλη συνεχίζει - χρηματοκιβώτιο,
 * POS καταστήματος, έξοδα, πιστώσεις, επιστροφές - και κλείνει σε ένα
 * «Σύνολο». Σε μια πρόχειρη βάρδια του demo όλες οι γραμμές ήταν 0,00 €
 * και το «Σύνολο» έλεγε 180,00 €: το αποθηκευμένο μικτό είχε μείνει από
 * προηγούμενη κατάσταση της φόρμας, αφού κάποιος έσβησε τα κοψίματα.
 *
 * Το αποθηκευμένο υπερισχύει - είναι ό,τι υπολόγισε το κλείσιμο και
 * υπέγραψε ο υπάλληλος, και από αυτό βγαίνει η απόκλιση. Αλλά η διαφορά
 * παίρνει δική της γραμμή, ώστε οι γραμμές συν τη διαφορά να ΕΙΝΑΙ το
 * σύνολο που διαβάζει ο ιδιοκτήτης.
 */
export interface GrossCountInput {
  /** Τα μετρημένα της βάρδιας, όπως τα βγάζει το auditCountedCash. */
  counted: unknown;
  bankDeposits?: unknown;
  storePos?: unknown;
  expensesGp?: unknown;
  expensesFnb?: unknown;
  creditsGranted?: unknown;
  creditsCollected?: unknown;
  /** Το αποθηκευμένο reconciliation_gross_total. */
  stored?: unknown;
}

export interface GrossCountAudit {
  /** Το άθροισμα των γραμμών που δείχνει η στήλη. */
  computed: number;
  /** Ό,τι κρατάει η βάση, ή το computed όταν δεν κρατάει τίποτα. */
  stored: number;
  /** stored − computed. 0 όταν βγαίνει. */
  unexplained: number;
  balances: boolean;
}

export function auditGrossCount(input: GrossCountInput): GrossCountAudit {
  const computed = round2(
    num(input.counted) +
      num(input.bankDeposits) +
      num(input.storePos) +
      num(input.expensesGp) +
      num(input.expensesFnb) +
      num(input.creditsGranted) -
      num(input.creditsCollected)
  );
  const hasStored =
    input.stored !== undefined && input.stored !== null && String(input.stored) !== '';
  const stored = hasStored ? round2(num(input.stored)) : computed;
  const unexplained = round2(stored - computed);
  return { computed, stored, unexplained, balances: Math.abs(unexplained) <= CENT };
}
