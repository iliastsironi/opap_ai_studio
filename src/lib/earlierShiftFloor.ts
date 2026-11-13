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
 * Δεν φτάνει να το λέει η οθόνη, και ο υπάλληλος δεν χρειάζεται να
 * κρύβεται από τα νούμερα της προηγούμενης: η βραδινή ΞΕΚΙΝΑ με τα τελικά
 * της πρωινής γραμμένα, και δεν γίνεται να γραφτεί μικρότερο νούμερο από
 * αυτά (restoreEarlierFinals παρακάτω). Ό,τι πουλήσει η βραδινή, το γράφει
 * πάνω από αυτά.
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
  /**
   * Πώς μετριέται η γραμμή («range», «bundle»…). Δύο βάρδιες που τη μετράνε
   * διαφορετικά δεν έχουν συγκρίσιμα τελικά: το ένα είναι σειριακός αριθμός,
   * το άλλο κομμάτια που απομένουν.
   */
  shape?: string;
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

/**
 * Το μήνυμα ΔΕΝ λέει πόσα είχε πουλήσει η προηγούμενη βάρδια. Ο υπάλληλος
 * δεν χρειάζεται να δει τα νούμερα του άλλου - χρειάζεται να μάθει ότι αυτό
 * που έγραψε δεν γίνεται, και γιατί. Η βάρδια ξεκινά από τις πωλήσεις της
 * προηγούμενης και ό,τι πουλήσει προστίθεται από πάνω.
 */
function describe(side: 'front' | 'back', hasBack: boolean, now: string): string {
  const where = hasBack ? `${side === 'front' ? 'Μπροστά' : 'Πίσω'} — ` : '';
  return (
    `${where}Δεν γίνεται: γράφεις ${now}, αλλά η προηγούμενη βάρδια έχει ήδη πουλήσει περισσότερα. ` +
    'Η βάρδια ξεκινά από τις πωλήσεις της προηγούμενης και ό,τι πουλήσει προστίθεται από πάνω.'
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
    if ((now.shape ?? '') !== (was.shape ?? '')) continue;

    const say = now.say ?? plain;
    const rowId = text(row.id);

    if (now.frontEntered && now.frontOrigin === was.frontOrigin && now.front < was.front) {
      found.push({
        rowId, side: 'front', now: now.front, earlier: was.front,
        message: describe('front', now.hasBack, say(now.front)),
      });
    }
    if (now.hasBack && now.backEntered && now.backOrigin === was.backOrigin && now.back < was.back) {
      found.push({
        rowId, side: 'back', now: now.back, earlier: was.back,
        message: describe('back', true, say(now.back)),
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

export type FloorSide = 'front' | 'back';

export interface RestoreResult<R> {
  /** Η γραμμή με τα τελικά της προηγούμενης βάρδιας όπου χρειάστηκε. */
  row: R;
  /** Η γραμμή της προηγούμενης βάρδιας, από όπου πάρθηκαν τα νούμερα. */
  earlier: R;
  /** Οι πλευρές που κρατούν το νούμερο της προηγούμενης (αλλαγμένες ή όχι). */
  held: FloorSide[];
  /** Οι πλευρές που άλλαξαν τώρα. */
  restored: FloorSide[];
}

export interface RestoreOptions {
  /**
   * 'blank': μόνο ό,τι είναι κενό - το γέμισμα όταν ανοίγει η βάρδια.
   * 'blank-or-below': και ό,τι γράφτηκε μικρότερο - όταν ο υπάλληλος φεύγει
   * από το πεδίο.
   */
  when: 'blank' | 'blank-or-below';
  /** Τα πεδία της γραμμής που κρατούν το τελικό του Μπροστά. */
  frontFields: ReadonlyArray<string>;
  /** Τα πεδία της γραμμής που κρατούν το τελικό του Πίσω. */
  backFields: ReadonlyArray<string>;
  /** Μόνο αυτές οι πλευρές εξετάζονται. Χωρίς αυτό, και οι δύο. */
  sides?: ReadonlyArray<FloorSide>;
}

/**
 * Βάζει πίσω τα τελικά της προηγούμενης βάρδιας εκεί που η βραδινή έχει
 * αφήσει κενό ή έχει γράψει λιγότερα. null όταν δεν υπάρχει τίποτα με το
 * οποίο να κρατιέται η γραμμή.
 *
 * Κρατιέται μια πλευρά μόνο όταν η προηγούμενη βάρδια ΓΡΑΨΕ τελικό εκεί και
 * οι δύο μετράνε από το ίδιο σημείο, με τον ίδιο τρόπο - οι ίδιοι κανόνες
 * με την ειδοποίηση παραπάνω, γιατί είναι το ίδιο ερώτημα. Αν η βραδινή
 * άνοιξε καινούριο πακέτο ή άλλαξε το αρχικό ο υπεύθυνος, τίποτα δεν
 * κρατιέται και ο πίνακας δουλεύει όπως πάντα.
 *
 * Επιστρέφει νέα γραμμή· δεν αλλάζει τις παραμέτρους.
 */
export function restoreEarlierFinals<R extends RowRef & Record<string, any>>(
  row: R,
  earlierRows: ReadonlyArray<R> | null | undefined,
  read: (row: R) => FloorReading | null,
  options: RestoreOptions
): RestoreResult<R> | null {
  if (!Array.isArray(earlierRows) || earlierRows.length === 0) return null;
  const earlier = matchingRow(row, earlierRows);
  if (!earlier) return null;
  const now = read(row);
  const was = read(earlier);
  if (!now || !was) return null;
  if ((now.shape ?? '') !== (was.shape ?? '')) return null;

  const wanted = options.sides ?? (['front', 'back'] as FloorSide[]);
  const held: FloorSide[] = [];
  const restored: FloorSide[] = [];
  let next: R = row;

  const consider = (
    side: FloorSide,
    holds: boolean,
    blank: boolean,
    below: boolean,
    fields: ReadonlyArray<string>
  ) => {
    if (!wanted.includes(side) || !holds) return;
    held.push(side);
    if (!(blank || (options.when === 'blank-or-below' && below))) return;
    const patch: Record<string, unknown> = {};
    for (const f of fields) patch[f] = earlier[f];
    next = { ...next, ...patch };
    restored.push(side);
  };

  consider(
    'front',
    was.frontEntered && now.frontOrigin === was.frontOrigin,
    !now.frontEntered,
    now.front < was.front,
    options.frontFields
  );
  consider(
    'back',
    now.hasBack && was.backEntered && now.backOrigin === was.backOrigin,
    !now.backEntered,
    now.back < was.back,
    options.backFields
  );

  return held.length === 0 ? null : { row: next, earlier, held, restored };
}
