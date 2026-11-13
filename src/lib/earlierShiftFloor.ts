/**
 * Τα νούμερα της ημέρας δεν μειώνονται: η βραδινή δεν μπορεί να έχει
 * πουλήσει λιγότερα από όσα είχε ήδη γράψει η προηγούμενη βάρδια.
 *
 * Μέσα στην ίδια μέρα ο πίνακας των σκρατς και των λαχείων μετράει από το
 * άνοιγμα της ημέρας (lib/scratchSeedSource.ts). Η βραδινή ξεκινά από το ίδιο
 * αρχικό με την πρωινή, και ό,τι γράφει στο τελικό είναι «πόσα πουλήθηκαν
 * ΣΥΝΟΛΙΚΑ από το πρωί». Αν η πρωινή έγραψε 5 και η βραδινή 4, κάποιο από τα
 * δύο είναι λάθος - και ένα σύνολο που πέφτει δεν φαίνεται πουθενά αλλού:
 * ownScratchSales το κόβει σιωπηλά στο μηδέν.
 *
 * Βγήκε από δεδομένα, όχι από εικασία. Σε 56 ζευγάρια βαρδιών της ίδιας
 * ημέρας (1188 γραμμές) το έκαναν δύο γραμμές, και οι δύο αληθινά λάθη:
 * ένα 7ΑΡΙ 5 € που η πρωινή τελείωσε στο 3 και η βραδινή στο 2, και ένα Λαϊκό
 * όπου η πρωινή είχε πουλήσει δύο πεντάδες και η βραδινή έγραψε μηδέν.
 *
 * Τρεις κανόνες κρατούν τον έλεγχο από το να κλαίει λύκος:
 *
 *   1. Μόνο ό,τι ΓΡΑΦΤΗΚΕ. Ένα κενό τελικό σημαίνει «δεν το μέτρησα ακόμα»,
 *      όχι «πούλησα μηδέν». Η βραδινή που μόλις άνοιξε έχει κενά παντού και
 *      δεν πρέπει να παραπονιέται για κάθε παιχνίδι που πούλησε το πρωί.
 *   2. Μόνο όταν και οι δύο μετράνε από το ΙΔΙΟ σημείο. Αν το αρχικό
 *      διαφέρει, η βραδινή άνοιξε καινούριο πακέτο ή ξεκίνησε δικό της
 *      μέτρημα (έτσι ήταν όλες οι βάρδιες πριν υπάρξει το σωρευτικό), και τα
 *      δύο σύνολα δεν είναι συγκρίσιμα.
 *   3. Μπροστά και Πίσω ξεχωριστά. Το άθροισμά τους θα έκρυβε μια πλευρά που
 *      έπεσε πίσω, πίσω από μια άλλη που ανέβηκε.
 *
 * Καθαρή συνάρτηση: το πώς μετριέται μια γραμμή έρχεται από αυτόν που
 * καλεί, ώστε η λογική να μην εξαρτάται από τον πίνακα που τη χρησιμοποιεί.
 */

import { isOwnShift } from './handoverCutoff.ts';
import { isDayFirstShift } from './scratchSeedSource.ts';

/** Πώς διαβάζεται μια γραμμή για τη σύγκριση. null: δεν συγκρίνεται καθόλου. */
export interface FloorReading {
  /** Πουλημένα Μπροστά, μέχρι τώρα. */
  front: number;
  /** Πουλημένα Πίσω, μέχρι τώρα. */
  back: number;
  /** Γράφτηκε τελικό Μπροστά. Κενό σημαίνει «δεν μετρήθηκε ακόμα». */
  frontEntered: boolean;
  /** Γράφτηκε ένδειξη Πίσω. */
  backEntered: boolean;
  /** Από πού μετράει το Μπροστά (το αρχικό). */
  frontOrigin: string;
  /** Από πού μετράει το Πίσω (το κλειδωμένο τελικό). */
  backOrigin: string;
  /** Η γραμμή πουλάει και από πίσω. */
  hasBack: boolean;
  /** Πώς γράφεται μια ποσότητα αυτής της γραμμής. */
  say?: (n: number) => string;
}

interface RowRef {
  id?: unknown;
  name?: unknown;
  category?: unknown;
}

export interface BelowEarlier {
  rowId: string;
  side: 'front' | 'back';
  now: number;
  earlier: number;
  message: string;
}

const text = (v: unknown): string => (v === undefined || v === null ? '' : String(v).trim());

/** Η ίδια γραμμή στην άλλη βάρδια: με id, αλλιώς με όνομα ΚΑΙ κατηγορία μαζί. */
export function matchingRow<R extends RowRef>(row: R, others: ReadonlyArray<R>): R | undefined {
  const byId = text(row.id) !== '' ? others.find((o) => text(o.id) === text(row.id)) : undefined;
  if (byId) return byId;
  return others.find(
    (o) => text(o.name) !== '' && text(o.name) === text(row.name) && text(o.category) === text(row.category)
  );
}

const plain = (n: number) => `${n} τεμ.`;

function describe(side: 'front' | 'back', hasBack: boolean, now: string, earlier: string): string {
  const where = hasBack ? (side === 'front' ? ' Μπροστά' : ' Πίσω') : '';
  return (
    `Οι πωλήσεις${where} (${now}) είναι λιγότερες από όσες είχε ήδη γράψει η προηγούμενη βάρδια (${earlier}). ` +
    'Τα νούμερα της ημέρας μόνο αυξάνονται — ελέγξτε τα.'
  );
}

/**
 * Οι γραμμές της τρέχουσας βάρδιας που έχουν γράψει λιγότερα από την
 * προηγούμενη. Κενή λίστα όταν δεν υπάρχει προηγούμενη βάρδια να συγκριθεί.
 */
export function belowEarlierShift<R extends RowRef>(
  rows: ReadonlyArray<R> | null | undefined,
  earlierRows: ReadonlyArray<R> | null | undefined,
  read: (row: R) => FloorReading | null
): BelowEarlier[] {
  if (!Array.isArray(rows) || !Array.isArray(earlierRows) || earlierRows.length === 0) return [];

  const found: BelowEarlier[] = [];
  for (const row of rows) {
    const earlier = matchingRow(row, earlierRows);
    if (!earlier) continue;
    const now = read(row);
    const was = read(earlier);
    if (!now || !was) continue;

    const say = now.say ?? plain;
    const rowId = text(row.id);

    if (now.frontEntered && now.frontOrigin === was.frontOrigin && now.front < was.front) {
      found.push({
        rowId, side: 'front', now: now.front, earlier: was.front,
        message: describe('front', now.hasBack, say(now.front), say(was.front)),
      });
    }
    if (now.hasBack && now.backEntered && now.backOrigin === was.backOrigin && now.back < was.back) {
      found.push({
        rowId, side: 'back', now: now.back, earlier: was.back,
        message: describe('back', true, say(now.back), say(was.back)),
      });
    }
  }
  return found;
}

/**
 * Ποιες γραμμές είναι η «προηγούμενη βάρδια» για τον έλεγχο, ή null όταν
 * δεν έχει νόημα να γίνει.
 *
 * Η ΠΡΩΤΗ βάρδια της ημέρας δεν συγκρίνεται: η προηγούμενη είναι το
 * χθεσινό βράδυ, και ένα νέο μέτρημα δεν χρωστά τίποτα σε εκείνο. Ούτε η ίδια
 * η βάρδια με τον εαυτό της (ο RPC του handover επιστρέφει <= του ορίου).
 */
export function earlierRowsForFloor(input: {
  handoverRows: unknown;
  handoverShiftId?: string | null;
  currentShiftId?: string | null;
  dayFirstOpenedAt?: string | null;
  openedAt?: string | null;
}): any[] | null {
  if (isDayFirstShift({ dayFirstOpenedAt: input.dayFirstOpenedAt, openedAt: input.openedAt })) return null;
  if (isOwnShift(input.handoverShiftId, input.currentShiftId)) return null;
  const rows = input.handoverRows;
  return Array.isArray(rows) && rows.length > 0 ? rows : null;
}
