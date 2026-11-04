/**
 * Το παράθυρο που ανοίγει όταν ξαναγράψεις τον κωδικό σου.
 *
 * Η διαγραφή βάρδιας υπάρχει ήδη και είναι οριστική: η πολιτική
 * `shifts_delete` τη δίνει σε κάθε ανεβασμένο ρόλο, για οποιαδήποτε βάρδια,
 * ακόμα και εγκεκριμένη, με ένα κλικ. Αυτό που λείπει δεν είναι το
 * δικαίωμα - είναι η απόδειξη ότι το πάτησε αυτός που νομίζουμε.
 *
 * Ο κωδικός ξαναγράφεται, και για λίγο μετά οι καταστροφικές ενέργειες
 * περνούν χωρίς να ξαναρωτηθεί. Έτσι το σβήσιμο τριών εξόδων δεν είναι
 * τρεις φορές ο ίδιος κωδικός - που είναι ο γρηγορότερος τρόπος να μάθει
 * κανείς να τον πληκτρολογεί χωρίς να διαβάζει τι υπογράφει.
 *
 * Πέντε λεπτά: αρκετά για μια δουλειά καθαρίσματος, πολύ λίγα για να
 * μείνει ανοιχτό σε έναν υπολογιστή που κάποιος άφησε και έφυγε.
 *
 * Ο χρόνος ΔΕΝ αποθηκεύεται πουθενά - ούτε localStorage, ούτε cookie. Ζει
 * στη μνήμη της καρτέλας και χάνεται με το refresh, γιατί ένα «είμαι
 * πιστοποιημένος» που επιβιώνει του κλεισίματος είναι ακριβώς το πράγμα
 * που θα έβρισκε κάποιος άλλος ανοιχτό.
 */

export const SUDO_WINDOW_MS = 5 * 60 * 1000;

/** Αν το παράθυρο είναι ακόμα ανοιχτό. */
export function isSudoValid(grantedAt: number | null, now: number): boolean {
  if (grantedAt === null || !Number.isFinite(grantedAt)) return false;
  // Ένα grantedAt στο μέλλον σημαίνει ότι το ρολόι γύρισε πίσω ή ότι κάποιος
  // το έγραψε. Κλειστό: η μόνη ασφαλής ανάγνωση μιας τιμής που δεν στέκει.
  if (grantedAt > now) return false;
  return now - grantedAt < SUDO_WINDOW_MS;
}

/** Πόσα ms μένουν, για την αντίστροφη μέτρηση στην οθόνη. */
export function sudoRemainingMs(grantedAt: number | null, now: number): number {
  if (!isSudoValid(grantedAt, now)) return 0;
  return SUDO_WINDOW_MS - (now - (grantedAt as number));
}

/** «4:12» - όσο μένει, για να φαίνεται ότι κλείνει. */
export function sudoRemainingLabel(grantedAt: number | null, now: number): string {
  const ms = sudoRemainingMs(grantedAt, now);
  if (ms <= 0) return '';
  const total = Math.ceil(ms / 1000);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
