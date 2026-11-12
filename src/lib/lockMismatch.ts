/**
 * Ποια γραμμή, ποιο πεδίο, ποιες τιμές - όταν η βάση αρνείται ένα σώσιμο.
 *
 * Ο trigger των κλειδωμένων πεδίων (0006/0083) λέει «Το πεδίο Πίσω - Τελικό
 * είναι κλειδωμένο... (παιχνίδι: Δώρο 5€)». Δεν λέει ΤΙ διαφέρει: ούτε τι
 * είναι γραμμένο, ούτε τι στάλθηκε. Το ίδιο μήνυμα έχει βγει από τέσσερις
 * διαφορετικές αιτίες (0007, 0080, 0083, και το παλιό στιγμιότυπο της
 * οθόνης), και κάθε φορά η αιτία βρέθηκε με ανάγνωση δεδομένων εκ των
 * υστέρων - όταν το σφάλμα είχε πια φύγει και ο υπάλληλος είχε ξανακάνει
 * τη δουλειά.
 *
 * Ο client όμως έχει ΚΑΙ ΤΑ ΔΥΟ στο χέρι τη στιγμή της αποτυχίας: τι έστειλε
 * και τι είναι αποθηκευμένο. Εδώ τα συγκρίνει και το λέει, ώστε η
 * φωτογραφία που στέλνει ο υπάλληλος να δείχνει από μόνη της το πρόβλημα.
 *
 * Καθαρή συνάρτηση, χωρίς εξαρτήσεις: ό,τι απαντάει εδώ είναι το ίδιο
 * «απόν = κενό» που ισχύει στη βάση από το 0007.
 */

const FRAGMENT = 'είναι κλειδωμένο και μπορεί να αλλάξει μόνο από Owner/Admin';

const FIELDS = {
  'Μπροστά - Αρχικό': 'startNo',
  'Πίσω - Τελικό': 'backEndNo',
} as const;

/** «Απόν» και «κενό» είναι το ίδιο πράγμα - όπως στον trigger. */
const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v));

/** Είναι αυτό το μήνυμα της κλειδαριάς των πεδίων; */
export function isLockError(message: unknown): boolean {
  return typeof message === 'string' && message.includes(FRAGMENT);
}

interface Row {
  id?: unknown;
  name?: unknown;
  startNo?: unknown;
  backEndNo?: unknown;
}

const rowsOf = (value: unknown): Row[] =>
  Array.isArray(value) ? (value.filter((r) => r && typeof r === 'object') as Row[]) : [];

/**
 * Αν το μήνυμα είναι της κλειδαριάς, τι ακριβώς διέφερε στη γραμμή που
 * ονομάζει. Αλλιώς null - για κάθε άλλο σφάλμα δεν έχει τι να πει.
 *
 * Βρίσκει τη γραμμή από το ΟΝΟΜΑ που γράφει το ίδιο το μήνυμα της βάσης και
 * όχι από τη δική του λογική: ό,τι κι αν αποφάσισε η βάση, εδώ φαίνεται τι
 * έχει η γραμμή που κατηγόρησε.
 */
export function describeLockMismatch(
  message: unknown,
  sentRows: unknown,
  storedRows: unknown
): string | null {
  if (!isLockError(message)) return null;
  const msg = String(message);

  const label = (Object.keys(FIELDS) as Array<keyof typeof FIELDS>).find((l) => msg.includes(`Το πεδίο ${l}`));
  const game = /\(παιχνίδι:\s*([^)]+)\)/.exec(msg)?.[1]?.trim();
  if (!label || !game) return null;
  const field = FIELDS[label];

  const named = (r: Row) => text(r.name) === game || text(r.id) === game;
  const sent = rowsOf(sentRows).find(named);
  if (!sent) return null;
  const stored = rowsOf(storedRows).find((r) => text(r.id) === text(sent.id));

  const stale = stored
    ? `βάση «${text(stored[field])}», οθόνη «${text(sent[field])}»`
    : `η γραμμή δεν υπάρχει στη βάση, οθόνη «${text(sent[field])}»`;
  return `${game} · ${label}: ${stale}`;
}
