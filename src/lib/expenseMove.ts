/**
 * Μετακίνηση ενός εξόδου από τον ένα πίνακα στον άλλον: έξοδο καταστήματος
 * (shift_expenses) ↔ έξοδο εταιρίας (company_daily_expenses).
 *
 * Ο ιδιοκτήτης: «ανάλογα το έξοδο να μπορούμε να το αλλάξουμε κατηγορία, αν
 * είναι έξοδα εταιρίας ή πάγιο ή κάτι άλλο». Η φόρμα το έλεγε αλλιώς: «Σβήστε
 * το και καταχωρήστε το ξανά». Αυτό ΕΙΝΑΙ διαγραφή και νέα εγγραφή, δύο
 * πίνακες, δύο κλήσεις - και στο ενδιάμεσο μπορεί να αποτύχει η δεύτερη.
 *
 * Η σειρά είναι αυτή που δεν χάνει ποτέ ποσό:
 *
 *   1. ΓΡΑΦΕΤΑΙ στον προορισμό.   Αν αποτύχει, δεν έγινε τίποτα.
 *   2. ΣΒΗΝΕΤΑΙ από την πηγή.     Αν αποτύχει, ακυρώνεται το βήμα 1.
 *   3. ΑΝΑΙΡΕΙΤΑΙ το βήμα 1.      Μένει ένα αντίγραφο, εκεί που ήταν.
 *
 * Το αντίθετο (πρώτα σβήσιμο) θα άφηνε ένα έξοδο που δεν υπάρχει πουθενά αν
 * έπεφτε το δίκτυο στη μέση. Το χειρότερο που μένει είναι να αποτύχει και η
 * αναίρεση: τότε υπάρχει ΔΙΠΛΟ έξοδο, και το λέμε φωναχτά - ένα διπλό που
 * φαίνεται διορθώνεται, ένα που δεν φαίνεται διπλομετράει σιωπηλά.
 */

export class MoveLeftDuplicateError extends Error {
  constructor(public readonly originalReason: string) {
    super(
      'Το έξοδο γράφτηκε στον νέο προορισμό αλλά δεν σβήστηκε από το παλιό, και δεν μπόρεσε να αναιρεθεί. ' +
        'Υπάρχει τώρα ΔΙΠΛΟ - σβήστε το ένα από τα δύο. ' +
        `(Αιτία: ${originalReason})`
    );
    this.name = 'MoveLeftDuplicateError';
  }
}

export interface MoveSteps {
  /** Γράφει το έξοδο στον προορισμό και γυρίζει το id που πήρε. */
  create: () => Promise<{ id: string }>;
  /** Σβήνει το έξοδο από την πηγή. Πρέπει να ρίχνει σφάλμα αν δεν έσβησε τίποτα. */
  removeOld: () => Promise<void>;
  /** Αναιρεί το create, όταν το removeOld απέτυχε. */
  undoCreate: (id: string) => Promise<void>;
}

export async function moveExpense(steps: MoveSteps): Promise<{ id: string }> {
  const created = await steps.create();
  try {
    await steps.removeOld();
  } catch (err: any) {
    try {
      await steps.undoCreate(created.id);
    } catch {
      throw new MoveLeftDuplicateError(String(err?.message || err));
    }
    throw err;
  }
  return created;
}

export interface ChargeChange {
  /** Χρεωνόταν στο ταμείο πριν την αλλαγή; */
  fromCharged: boolean;
  /** Θα χρεώνεται μετά; */
  toCharged: boolean;
  /** Πάει στα έξοδα εταιρίας. */
  toCompany: boolean;
  /** Η κατάσταση της βάρδιας που κρατάει το έξοδο· null όταν δεν είναι δεμένο σε βάρδια. */
  shiftStatus: string | null;
  /** Ξέρουμε ότι η βάρδια είναι ζωντανή (ανοιχτή ή σε κλείσιμο); */
  shiftIsLive: boolean;
}

/**
 * Γιατί ΔΕΝ γίνεται αυτή η αλλαγή στη χρέωση του ταμείου, ή null όταν γίνεται.
 *
 * Ο ιδιοκτήτης: οι κλεισμένες βάρδιες μένουν όπως είναι, εκτός από τα έξοδα
 * εταιρίας. Μια κλεισμένη βάρδια έχει αποθηκευμένα το αναμενόμενο ταμείο και
 * την απόκλιση· αν ένα έξοδό της έβγαινε από το ταμείο, αυτά θα έμεναν όπως
 * έκλεισαν και θα έλεγαν άλλο νούμερο από το άθροισμα εξόδων της.
 */
export function chargeChangeBlock(change: ChargeChange): string | null {
  if (change.toCompany) return null;
  if (!change.shiftStatus || change.shiftIsLive) return null;
  if (change.fromCharged === change.toCharged) return null;
  return (
    'Αυτό το έξοδο ανήκει σε βάρδια που έχει κλείσει, και οι κλεισμένες βάρδιες μένουν όπως είναι. ' +
    'Δεν αλλάζει η χρέωσή του στο ταμείο· μπορείτε όμως να το μετακινήσετε στα έξοδα εταιρίας.'
  );
}
