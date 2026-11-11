/**
 * Οι καταστάσεις μιας βάρδιας, και η μία γραμμή που τις χωρίζει.
 *
 * Το ShiftStatus έχει έξι τιμές. Η διαίρεσή τους σε «τρέχει» και «μετρήθηκε»
 * είναι η απάντηση σε δύο ερωτήσεις από τις οποίες κρέμονται λεφτά:
 *
 *   - μπορεί ν' ανοίξει βάρδια εδώ τώρα;        (lib/shiftOpenRules.ts)
 *   - μπαίνει αυτή η βάρδια στα σύνολα;         (επισκόπηση, P&L)
 *
 * Η δεύτερη ζούσε σε δύο μέρη με δύο απαντήσεις: ο pnlEngine φιλτράριζε
 * «SUBMITTED ή APPROVED» - «only closed shifts have a meaningful count» -
 * και η επισκόπηση δεν φιλτράριζε καθόλου, οπότε έδειχνε συνολική απόκλιση
 * −1.658,11 € όταν η αλήθεια μέχρι την τελευταία κλεισμένη βάρδια ήταν
 * −136,70 €: η διαφορά ήταν δύο ταμεία που δούλευαν ακόμα.
 *
 * Αυτό το αρχείο δεν εισάγει τίποτα, επίτηδες. Είναι το φύλλο που μπορούν
 * να διαβάσουν και ο pnlEngine και οι κανόνες ανοίγματος χωρίς κυκλική
 * εξάρτηση - ο shiftOpenRules διαβάζει ήδη athensDateKey από τον pnlEngine,
 * και μια αντίστροφη εισαγωγή θα έκλεινε τον κύκλο πάνω στη μηχανή που
 * βγάζει τα νούμερα.
 *
 * Οι δύο λίστες μαζί καλύπτουν ΟΛΟΚΛΗΡΟ το ShiftStatus. Αν προστεθεί ποτέ
 * έβδομη κατάσταση, εδώ αποφασίζεται σε ποια μεριά πέφτει - και όχι σε
 * αθροίσματα σκορπισμένα σε τρεις οθόνες.
 */

/** Δουλεύεται τώρα: τα νούμερά της είναι μισοσυμπληρωμένα. */
export const ACTIVE_SHIFT_STATUSES: ReadonlyArray<string> = [
  'OPEN',
  'DRAFT_CLOSING',
  'CORRECTION_REQUESTED',
  'REOPENED',
];

/** Μετρήθηκε και υποβλήθηκε: τα νούμερά της σημαίνουν κάτι. */
export const CLOSED_SHIFT_STATUSES: ReadonlyArray<string> = ['SUBMITTED', 'APPROVED'];

export function isActiveStatus(status: unknown): boolean {
  return ACTIVE_SHIFT_STATUSES.includes(String(status ?? ''));
}

export function isClosedStatus(status: unknown): boolean {
  return CLOSED_SHIFT_STATUSES.includes(String(status ?? ''));
}

/** Μετρήθηκε και υποβλήθηκε: τα νούμερά της σημαίνουν κάτι. */
export function isClosedShift(shift: { status?: string | null } | null | undefined): boolean {
  return isClosedStatus(shift?.status);
}

/**
 * Μόνο όσες έχουν κλείσει - ό,τι μπαίνει σε άθροισμα που διαβάζει άνθρωπος.
 *
 * Γενικό στον τύπο επίτηδες: τα ίδια αθροίσματα γίνονται πάνω σε Shift της
 * βάσης, σε γραμμές του pnlEngine και σε ό,τι σχήμα κρατάει μια οθόνη. Η
 * κατάσταση είναι το μόνο που χρειάζεται να ξέρει ο κανόνας.
 */
export function closedShifts<T extends { status?: string | null }>(
  shifts: ReadonlyArray<T> | null | undefined
): T[] {
  return (shifts ?? []).filter((s) => isClosedShift(s));
}
