/**
 * Ποιος μπορεί να ανοίξει βάρδια, και ποια βάρδια είναι δική του.
 *
 * Τρεις κανόνες που ο ιδιοκτήτης διατύπωσε μαζί, γιατί είναι το ίδιο
 * πράγμα ειπωμένο από τρεις μεριές:
 *
 *   1. Σε ένα μαγαζί, μία ανοιχτή βάρδια, ΕΝΑ άτομο.
 *   2. Όποιος δεν τη δουλεύει, δεν τη βλέπει σαν δική του.
 *   3. Όποιος έκλεισε βάρδια σήμερα, δεν ξανανοίγει σήμερα. Αυστηρό.
 *
 * Ο πρώτος υπήρχε ήδη στη βάση - ux_shifts_one_active_per_register από το
 * 0001 - αλλά μόνο εκεί: η οθόνη άφηνε να συμπληρωθεί ολόκληρη η φόρμα και
 * το έμαθε κανείς από ένα «duplicate key» στο τέλος. Ο δεύτερος δεν υπήρχε
 * πουθενά: η ανοιχτή βάρδια του καταστήματος εμφανιζόταν σε όποιον συνδεόταν,
 * με το όνομα εκείνου που τη δούλευε - γι' αυτό «σε όλους γράφει Γιώργος
 * Κουτρομάνος». Ο τρίτος δεν υπήρχε καθόλου.
 */

import { athensDateKey } from './pnlEngine.ts';

/**
 * Οι καταστάσεις που μετράνε ως «ανοιχτή».
 *
 * Ίδιες ακριβώς με τον μοναδικό δείκτη της βάσης. Αν αποκλίνουν, η οθόνη θα
 * λέει «ελεύθερο» για κάτι που η βάση θα αρνηθεί - ή, χειρότερα, το αντίθετο.
 */
export const ACTIVE_SHIFT_STATUSES: ReadonlyArray<string> = [
  'OPEN',
  'DRAFT_CLOSING',
  'CORRECTION_REQUESTED',
  'REOPENED',
];

export interface ShiftLike {
  id?: string;
  store_id?: string | null;
  status?: string | null;
  opened_at?: string | null;
  opened_by_user_id?: string | null;
  opened_by_user_name?: string | null;
}

export function isActiveShift(shift: ShiftLike | null | undefined): boolean {
  return ACTIVE_SHIFT_STATUSES.includes(String(shift?.status ?? ''));
}

/**
 * Η βάρδια που τρέχει τώρα σε αυτό το κατάστημα, αν υπάρχει.
 *
 * Το κατάστημα, όχι το ταμείο: ο κανόνας του ιδιοκτήτη είναι ένα άτομο ανά
 * ΜΑΓΑΖΙ. Ο δείκτης της βάσης κλειδώνει ανά ταμείο, που είναι στενότερο -
 * άρα η οθόνη εδώ είναι πιο αυστηρή από τη βάση, που είναι η ακίνδυνη
 * κατεύθυνση. Το αντίστροφο δίνει κουμπί που αποτυγχάνει.
 */
export function activeShiftAt<T extends ShiftLike>(
  shifts: ReadonlyArray<T> | null | undefined,
  storeId: string | null | undefined
): T | null {
  const store = String(storeId ?? '');
  if (!store) return null;
  return (shifts ?? []).find((s) => String(s.store_id ?? '') === store && isActiveShift(s)) ?? null;
}

/** Δουλεύει ΑΥΤΟΣ ο χρήστης αυτή τη βάρδια; */
export function worksThisShift(
  shift: ShiftLike | null | undefined,
  userId: string | null | undefined
): boolean {
  const me = String(userId ?? '');
  if (!shift || !me) return false;
  return String(shift.opened_by_user_id ?? '') === me;
}

/** Το όνομα του χειριστή, για μήνυμα. Ποτέ κενό. */
const operatorName = (shift: ShiftLike): string =>
  String(shift.opened_by_user_name ?? '').trim() || 'άλλος χειριστής';

export interface OpenAttempt {
  storeId: string;
  /** Ποιος θα δουλέψει τη βάρδια - όχι απαραίτητα αυτός που πατάει. */
  operatorId: string;
  operatorName?: string | null;
  /** Πότε ανοίγει, ώστε ο κανόνας της ημέρας να μετράει τη σωστή. */
  openedAt: string;
  /** Οι βάρδιες που ξέρει η οθόνη - αρκεί να καλύπτουν σήμερα. */
  shifts: ReadonlyArray<ShiftLike>;
  /** Ο ιδιοκτήτης/διαχειριστής μπορεί να γράψει βάρδια για περασμένη μέρα. */
  isElevated?: boolean;
}

/**
 * Γιατί δεν μπορεί να ανοίξει βάρδια, ή null αν μπορεί.
 *
 * Ελέγχεται ΠΡΙΝ συμπληρωθεί οτιδήποτε. Ένα «duplicate key» αφού μετρήσει
 * κανείς το συρτάρι δεν είναι έλεγχος, είναι τιμωρία.
 */
export function openBlockedReason(attempt: OpenAttempt): string | null {
  const running = activeShiftAt(attempt.shifts, attempt.storeId);
  if (running) {
    return worksThisShift(running, attempt.operatorId)
      ? 'Έχετε ήδη ανοιχτή βάρδια σε αυτό το κατάστημα. Κλείστε την πρώτα.'
      : `Υπάρχει ήδη ανοιχτή βάρδια σε αυτό το κατάστημα, από τον/την ${operatorName(running)}. ` +
        'Σε ένα μαγαζί δουλεύει ένα άτομο κάθε φορά — πρέπει να κλείσει πρώτα η δική του.';
  }

  // Ο ίδιος άνθρωπος, η ίδια ημέρα. Μετράει ΚΑΘΕ βάρδια του, κλεισμένη ή
  // υποβληθείσα: το ζητούμενο δεν είναι «δεν τρέχει άλλη», είναι «δούλεψε
  // ήδη σήμερα».
  const day = athensDateKey(attempt.openedAt);
  const me = String(attempt.operatorId ?? '');
  const alreadyToday =
    me &&
    (attempt.shifts ?? []).find(
      (s) =>
        String(s.store_id ?? '') === String(attempt.storeId ?? '') &&
        String(s.opened_by_user_id ?? '') === me &&
        athensDateKey(String(s.opened_at ?? '')) === day
    );
  if (alreadyToday) {
    const who = String(attempt.operatorName ?? '').trim();
    return who
      ? `Ο/Η ${who} έχει ήδη βάρδια σήμερα σε αυτό το κατάστημα. Μία βάρδια ανά άτομο την ημέρα.`
      : 'Έχετε ήδη βάρδια σήμερα σε αυτό το κατάστημα. Μία βάρδια ανά άτομο την ημέρα.';
  }

  return null;
}
