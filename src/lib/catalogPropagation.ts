/**
 * Ο 4ψήφιος γράφεται μία φορά, όχι μία ανά μαγαζί.
 *
 * «Τα 4ψήφια είναι παντού τα ίδια.» Και είναι: στα 22 κοινά παιχνίδια των
 * δύο καταστημάτων, ο αριθμός παιχνιδιού, η τιμή, το μέγεθος πακέτου και το
 * είδος ταυτίζονται 22/22. Ο αριθμός ανήκει στο ΠΑΙΧΝΙΔΙ - τον δίνει ο ΟΠΑΠ
 * - όχι στο μαγαζί.
 *
 * Ο κατάλογος όμως κρατιέται ανά κατάστημα, και το τίμημα φάνηκε στα
 * χριστουγεννιάτικα: μπήκαν στη Λαμία και η Στυλίδα δεν τα είδε ποτέ. Το
 * ίδιο λάθος έχει ήδη αφήσει και ίχνος - «7ΑΡΙ 50€» και «Σκρατς League 5€»
 * υπάρχουν και στα δύο μαγαζιά με τον ΙΔΙΟ 4ψήφιο και διαφορετικό εσωτερικό
 * κωδικό, γιατί γράφτηκαν χωριστά.
 *
 * ΤΑΥΤΟΤΗΤΑ ΠΑΙΧΝΙΔΙΟΥ, με αυτή τη σειρά:
 *
 *   1. ο 4ψήφιος, όταν υπάρχει - είναι ο πανελλαδικός αριθμός, και δύο
 *      γραμμές με τον ίδιο είναι το ίδιο παιχνίδι ό,τι κι αν λένε τα
 *      υπόλοιπα,
 *   2. ο εσωτερικός κωδικός,
 *   3. το όνομα, χωρίς τόνους και πεζά-κεφαλαία.
 *
 * Η σειρά έχει σημασία: αν κοιτούσαμε μόνο τον εσωτερικό κωδικό, το «7ΑΡΙ
 * 50€» θα ξαναγραφόταν στη Στυλίδα ως δεύτερο παιχνίδι με τον ίδιο 4ψήφιο -
 * δηλαδή η αντιγραφή θα δημιουργούσε ακριβώς το μπέρδεμα που έρχεται να
 * λύσει. Τα λαχεία δεν έχουν 4ψήφιο και πέφτουν στον κωδικό ή στο όνομα.
 */

// Η ίδια σύγκριση που κρίνει αν δύο έξοδα είναι ο ίδιος προμηθευτής: χωρίς
// τόνους, χωρίς κεφαλαία, χωρίς διπλά κενά. Μία απάντηση στο «ίδιο όνομα;».
import { normalizeRecipient } from './duplicateExpense.ts';

export interface CatalogGame {
  /** Ο εσωτερικός κωδικός της γραμμής (scratch_catalog.code / row.id). */
  code?: unknown;
  name?: unknown;
  /** Ο 4ψήφιος αριθμός παιχνιδιού του ΟΠΑΠ. */
  gameNo?: unknown;
}

const str = (v: unknown): string => String(v ?? '').trim();

/** Ο 4ψήφιος, ή κενό όταν δεν είναι τεσσάρων ψηφίων. */
export function gameNumber(game: CatalogGame | null | undefined): string {
  const no = str(game?.gameNo);
  return /^\d{4}$/.test(no) ? no : '';
}

/** Τα τρία κλειδιά με τα οποία αναγνωρίζεται ένα παιχνίδι σε άλλο μαγαζί. */
function keysOf(game: CatalogGame): { no: string; code: string; name: string } {
  return {
    no: gameNumber(game),
    code: str(game.code),
    name: normalizeRecipient(str(game.name)),
  };
}

/** Είναι το ίδιο παιχνίδι, γραμμένο σε δύο καταλόγους; */
export function sameGame(a: CatalogGame, b: CatalogGame): boolean {
  const x = keysOf(a);
  const y = keysOf(b);
  if (x.no !== '' && y.no !== '') return x.no === y.no;
  if (x.code !== '' && x.code === y.code) return true;
  return x.name !== '' && x.name === y.name;
}

/**
 * Ποια παιχνίδια της πηγής λείπουν από τον προορισμό.
 *
 * Μόνο προσθήκες. Η αφαίρεση δεν ταξιδεύει ποτέ: το ποια παιχνίδια ΠΟΥΛΑΕΙ
 * ένα μαγαζί είναι δική του απόφαση, και ένα παιχνίδι που σβήστηκε στη
 * Λαμία μπορεί να πουλάει στη Στυλίδα.
 */
export function gamesMissingFrom<T extends CatalogGame>(
  source: ReadonlyArray<T> | null | undefined,
  target: ReadonlyArray<CatalogGame> | null | undefined
): T[] {
  const have = target ?? [];
  const missing: T[] = [];
  for (const game of source ?? []) {
    if (str(game.code) === '' && str(game.name) === '') continue;
    if (have.some((t) => sameGame(game, t))) continue;
    // Και μεταξύ τους: δύο γραμμές της πηγής με τον ίδιο 4ψήφιο δεν
    // αντιγράφονται δύο φορές.
    if (missing.some((m) => sameGame(game, m))) continue;
    missing.push(game);
  }
  return missing;
}
