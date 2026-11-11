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
import { isActiveStatus, isClosedShift } from './shiftStatus.ts';

// Οι δύο λίστες ζουν στο lib/shiftStatus.ts - φύλλο χωρίς εισαγωγές, ώστε
// να μπορεί να τις διαβάσει και ο pnlEngine χωρίς κύκλο. Ξαναβγαίνουν από
// εδώ γιατί εδώ τις ζητούσαν μέχρι τώρα.
export {
  ACTIVE_SHIFT_STATUSES,
  CLOSED_SHIFT_STATUSES,
  isClosedShift,
  closedShifts,
} from './shiftStatus.ts';

/**
 * Οι καταστάσεις μιας βάρδιας που ΕΧΕΙ μετρηθεί.
 *
 * «Στην επισκόπηση που μου δείχνεις αποκλίσεις ταμείου, έσοδα, έξοδα και
 * λοιπά, να μην τα βλέπει live με το ταμείο που είναι ανοιχτό, γιατί πάει
 * και μου βγάζει μια απόκλιση πολύ μεγάλη. Θέλουμε να βλέπει μέχρι την
 * τελευταία κλεισμένη βάρδια· τα ταμεία που τρέχουνε θα περνάνε μέσα μόλις
 * κλείνουνε.»
 *
 * Και είχε δίκιο στο νούμερο: η συνολική απόκλιση του πρακτορείου έγραφε
 * −1.658,11 € ενώ μέχρι την τελευταία κλεισμένη βάρδια ήταν −136,70 €. Η
 * διαφορά ήταν δύο ταμεία που δούλευαν ακόμα, και το ένα τους κουβαλούσε
 * μια μισοσυμπληρωμένη απόκλιση −1.531,10 €. Ένα ταμείο στη μέση της
 * βάρδιας δεν έχει απόκλιση· έχει μετρήσεις που δεν έχουν γίνει ακόμα.
 *
 * Ο κανόνας υπήρχε ήδη στον pnlEngine - «only closed shifts have a
 * meaningful count» - και έλειπε από την επισκόπηση. Τώρα είναι ένας, εδώ,
 * και τον διαβάζουν και οι δύο.
 *
 * Μαζί με τα ACTIVE_SHIFT_STATUSES καλύπτουν ΟΛΟΚΛΗΡΟ το ShiftStatus
 * (OPEN, DRAFT_CLOSING, CORRECTION_REQUESTED, REOPENED | SUBMITTED,
 * APPROVED), οπότε «κλεισμένη» και «όχι σε εξέλιξη» σήμερα συμπίπτουν. Αν
 * προστεθεί ποτέ έβδομη κατάσταση, εδώ αποφασίζεται σε ποια μεριά πέφτει -
 * και όχι σε έξι αθροίσματα σκορπισμένα σε τρεις οθόνες.
 */
export interface ShiftLike {
  id?: string;
  store_id?: string | null;
  status?: string | null;
  opened_at?: string | null;
  opened_by_user_id?: string | null;
  opened_by_user_name?: string | null;
  closed_by_user_id?: string | null;
}

export function isActiveShift(shift: ShiftLike | null | undefined): boolean {
  return isActiveStatus(shift?.status);
}

/**
 * Πότε έκλεισε η τελευταία - το «μέχρι πότε» ενός αθροίσματος.
 *
 * Λέγεται, δεν υπονοείται: ένα σύνολο χωρίς ημερομηνία διαβάζεται ως «τώρα»,
 * και τώρα είναι ακριβώς αυτό που δεν είναι. Προτιμά το closed_at και πέφτει
 * στο opened_at όταν λείπει - μια βάρδια υποβληθείσα πριν μπει η στήλη δεν
 * έχει ώρα κλεισίματος, και το άνοιγμά της είναι πιο κοντά από το τίποτα.
 */
export function lastClosedAt(
  shifts: ReadonlyArray<ShiftLike & { closed_at?: string | null }> | null | undefined
): string | null {
  let latest: string | null = null;
  for (const s of shifts ?? []) {
    if (!isClosedShift(s)) continue;
    const when = String(s.closed_at ?? '').trim() || String(s.opened_at ?? '').trim();
    if (when === '') continue;
    if (latest === null || when > latest) latest = when;
  }
  return latest;
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

/**
 * Είναι δική του αυτή η βάρδια - να τη δει, όχι να τη δουλέψει;
 *
 * Πιο πλατύ από το worksThisShift επίτηδες: μια βάρδια αλλάζει χέρια, κι
 * όποιος την έκλεισε έχει κάθε λόγο να διαβάζει το ταμείο που μέτρησε.
 * Ίδιος κανόνας με τη βάση (0022: opened_by_user_id OR closed_by_user_id).
 */
export function ownShift(
  shift: ShiftLike | null | undefined,
  userId: string | null | undefined
): boolean {
  const me = String(userId ?? '');
  if (!shift || !me) return false;
  return (
    String(shift.opened_by_user_id ?? '') === me ||
    String(shift.closed_by_user_id ?? '') === me
  );
}

/**
 * Ποιες βάρδιες επιτρέπεται να δει αυτός ο χρήστης.
 *
 * «Ο υπάλληλος θα βλέπει μόνο τη βάρδια τη δική του, καμία άλλη. Ο admin
 * φυσικά θα βλέπει όλες τις ανοιχτές βάρδιες.»
 *
 * Η λίστα κατέβαινε ολόκληρη και δεν φιλτραριζόταν πουθενά: υπάλληλος της
 * Στυλίδας έβλεπε την ανοιχτή βάρδια της Λαμίας, με το όνομα εκείνου που
 * τη δούλευε. Η βάση έδινε τη γραμμή (0022/0054, στενεύει στο 0079) και η
 * οθόνη τη ζωγράφιζε.
 *
 * Δύο μισά, γιατί το ένα δεν αρκεί: αυτό εδώ καθορίζει τι ΒΛΕΠΕΙ κανείς, η
 * πολιτική της βάσης τι ΜΠΟΡΕΙ να φτάσει στον browser του.
 */
export function visibleShifts<T extends ShiftLike>(
  shifts: ReadonlyArray<T> | null | undefined,
  userId: string | null | undefined,
  seesEverything: boolean
): T[] {
  const list = shifts ?? [];
  if (seesEverything) return [...list];
  return list.filter((s) => ownShift(s, userId));
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
