/**
 * Ποιος σβήνει ποια βάρδια.
 *
 * Μέχρι τώρα η οθόνη έδειχνε το κουμπί σε `isOwnerOrAdmin || canApprove`,
 * που περιλαμβάνει SHIFT_LEADER - τον οποίο η βάση αρνείται, γιατί το
 * auth_is_elevated() δεν τον έχει. Κουμπί που αποτυγχάνει πάντα: η χειρότερη
 * μορφή δικαιώματος, γιατί μοιάζει με σφάλμα του συστήματος αντί για όριο.
 *
 * Και το κουμπί υπήρχε μόνο σε πρόχειρες βάρδιες. Μια λάθος καταχωρημένη
 * βάρδια που έχει υποβληθεί ή εγκριθεί δεν σβηνόταν από πουθενά - παρόλο
 * που η πολιτική shifts_delete δεν κοιτάει καν κατάσταση. Γι' αυτό όλα τα
 * κείμενα έλεγαν «Διαγραφή Προχείρου».
 *
 * Δύο κύκλοι τώρα, και ο στενός δεν είναι τεχνικός περιορισμός αλλά κρίση:
 *
 *   ΠΡΟΧΕΙΡΗ    όποιος μπορεί και στη βάση - καθημερινό καθάρισμα
 *   ΚΛΕΙΣΜΕΝΗ   μόνο ιδιοκτησία/διοίκηση - τα ποσά έχουν περάσει σε αναφορές
 *
 * Ο υπεύθυνος καταστήματος καθαρίζει τα δικά του πρόχειρα· το να σβήσει
 * εγκεκριμένο ταμείο είναι απόφαση που ανήκει σε αυτόν που απαντάει για τα
 * βιβλία.
 */

/**
 * Οι δύο κύκλοι ρόλων έφυγαν σε δικό τους φύλλο (authCircles.ts) τη στιγμή
 * που τους χρειάστηκε και η οθόνη των εξόδων: η ίδια λίστα ρόλων γραμμένη
 * δεύτερη φορά είναι η ίδια ερώτηση με δύο απαντήσεις που θα διαφωνήσουν.
 * Μένουν εξαγόμενα από εδώ, γιατί εδώ τα ζητάνε όσοι τα ζητούσαν πάντα.
 */
import { ELEVATED_ROLES, OWNER_ROLES } from './authCircles.ts';

export { ELEVATED_ROLES, OWNER_ROLES };

/** Καταστάσεις όπου η βάρδια δεν έχει ακόμα υποβληθεί. */
export const DRAFT_STATUSES = [
  'OPEN',
  'DRAFT_CLOSING',
  'CORRECTION_REQUESTED',
  'REOPENED',
] as const;

export function isDraftStatus(status: unknown): boolean {
  return (DRAFT_STATUSES as ReadonlyArray<string>).includes(String(status ?? ''));
}

const hasAny = (roleCodes: ReadonlyArray<string>, allowed: ReadonlyArray<string>): boolean =>
  roleCodes.some((code) => allowed.includes(code));

/**
 * Αν αυτός ο χρήστης μπορεί να σβήσει βάρδια σε αυτή την κατάσταση.
 *
 * Άγνωστη κατάσταση μετριέται ως κλεισμένη: ο στενότερος κύκλος είναι η
 * μόνη ασφαλής ανάγνωση για κάτι που δεν αναγνωρίζουμε.
 */
export function canDeleteShift(
  roleCodes: ReadonlyArray<string> | null | undefined,
  status: unknown
): boolean {
  const codes = (roleCodes ?? []).map((c) => String(c ?? ''));
  if (codes.length === 0) return false;
  return isDraftStatus(status) ? hasAny(codes, ELEVATED_ROLES) : hasAny(codes, OWNER_ROLES);
}

/**
 * Τι γράφει το κουμπί.
 *
 * «Προχείρου» έπαψε να είναι αλήθεια τη στιγμή που το κουμπί εμφανίστηκε σε
 * εγκεκριμένη βάρδια, και μια ετικέτα που λέει ψέματα για το τι σβήνει είναι
 * χειρότερη από καμία.
 */
export function deleteShiftLabel(status: unknown): string {
  return isDraftStatus(status) ? 'Διαγραφή Προχείρου' : 'Διαγραφή Βάρδιας';
}

/**
 * Η προειδοποίηση που δικαιολογεί τον κωδικό, όταν η βάρδια έχει κλείσει.
 *
 * null για πρόχειρη: μια προειδοποίηση που εμφανίζεται πάντα δεν διαβάζεται
 * ποτέ, και τότε χάνεται μαζί με τις υπόλοιπες αυτή που είχε σημασία.
 */
export function closedShiftWarning(status: unknown): string | null {
  if (isDraftStatus(status)) return null;
  return String(status) === 'APPROVED'
    ? 'Εγκεκριμένη βάρδια: τα ποσά της έχουν ήδη περάσει σε αναφορές και στο P&L.'
    : 'Κλεισμένη βάρδια: έχει υποβληθεί προς έγκριση και τα ποσά της μετράνε στην ημέρα.';
}
