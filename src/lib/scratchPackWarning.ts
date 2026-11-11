/**
 * Telling the shop a pack is about to run out, while there is still time.
 *
 * A pack that finishes mid-shift is a game the shop cannot sell until
 * somebody fetches the next one - and the fetching happens when the shelf is
 * already empty, because nothing says it is coming. The numbers needed are
 * already on the row: a pack's size follows from the price, and the current
 * serial says how far through it is.
 *
 * WHEN to warn is a judgement, so it is written here rather than scattered
 * through the table. A tenth of the pack, never fewer than three tickets and
 * never more than ten:
 *
 *   1 €   300 per pack → 10   (a tenth would be 30, which is too eager)
 *   2 €   150          → 10
 *   5 €    60          →  6
 *  10 €    30          →  3
 *  20 €    15          →  3   (a tenth is 1,5; three is the floor)
 *
 * The cap keeps a cheap game from crying wolf for a week; the floor keeps an
 * expensive one from giving a single ticket's notice. The exact count is
 * always shown beside the warning, so the threshold never has to be guessed.
 *
 * Σκρατς only. Λαχεία count DOWN - their figure IS the remaining stock, with
 * no pack behind it - so «how far through the pack» has no meaning for them.
 */

import { packPieceCount } from './scratchPack.ts';

const FLOOR = 3;
const CAP = 10;

/** How few tickets must be left before this game is worth flagging. */
export function warnBelow(
  price: number | null | undefined,
  declaredPieces?: unknown
): number | null {
  const pieces = packPieceCount(price, declaredPieces);
  if (pieces === null) return null;
  return Math.min(CAP, Math.max(FLOOR, Math.round(pieces / 10)));
}

export interface PackRow {
  price?: number | null;
  /**
   * Δελτία ανά πακέτο από τον κατάλογο, όπου ο κανόνας των 300 € δεν ισχύει.
   *
   * Χωρίς αυτό το Χ50 υπολογιζόταν 300/50 = 6 δελτία, οπότε με το πακέτο
   * στη θέση 4 η οθόνη έλεγε «Τελειώνει — 2 δελτία» ενώ απέμεναν 11.
   */
  packPieces?: number | null;
  /** Where the pack was when the shift found it. */
  startNo?: unknown;
  /** Where it is now, when the shift has counted. */
  endNo?: unknown;
}

const position = (row: PackRow): number | null => {
  for (const raw of [row.endNo, row.startNo]) {
    const text = String(raw ?? '').trim();
    if (text === '') continue;
    const n = parseInt(text, 10);
    if (Number.isFinite(n)) return Math.max(0, n);
  }
  return null;
};

/** Tickets still on the shelf in this row's pack, or null when unknowable. */
export function piecesRemaining(row: PackRow): number | null {
  const pieces = packPieceCount(row.price, row.packPieces);
  if (pieces === null) return null;
  const at = position(row);
  if (at === null) return null;
  return Math.max(0, pieces - at);
}

export type PackState = 'ok' | 'ending' | 'finished';

export interface PackWarning {
  state: PackState;
  remaining: number;
  /** The figure the warning was measured against, for the message. */
  threshold: number;
}

/**
 * Null when there is nothing to say: a non-standard price, a row nobody has
 * counted, or a pack with plenty left. A warning is only worth drawing when
 * it changes what somebody does.
 */
export function packWarning(row: PackRow): PackWarning | null {
  const threshold = warnBelow(row.price, row.packPieces);
  const remaining = piecesRemaining(row);
  if (threshold === null || remaining === null) return null;

  if (remaining === 0) return { state: 'finished', remaining, threshold };
  if (remaining <= threshold) return { state: 'ending', remaining, threshold };
  return null;
}

export function packWarningText(warning: PackWarning): string {
  return warning.state === 'finished'
    ? 'Τελείωσε — ανοίξτε νέο πακέτο'
    : `Τελειώνει — ${warning.remaining} ${warning.remaining === 1 ? 'δελτίο' : 'δελτία'}`;
}

/**
 * Το πακέτο τελείωσε και δεν πούλησε τίποτα αυτή η βάρδια.
 *
 * Στην επιθεώρηση οι τελειωμένες γραμμές έδειχναν ακόμα νούμερο - «24 ΜΗΝΕΣ
 * 2€ · Μπρ. Αρχικό 150 · Σύνολο 0 τμχ» - και το 150 διαβάζεται σαν
 * απόθεμα ενώ είναι η θέση ΜΕΤΑ το τελευταίο δελτίο, δηλαδή άδειο ράφι. Τα
 * λόγια του ιδιοκτήτη: «όταν ένα σκρατς είναι τελειωμένο να το δείχνει ότι
 * δεν υπάρχει και όχι τον τελευταίο αριθμό του ξυστού πωλήθηκε». Στο
 * πρακτορείο υπάρχουν 371 τέτοιες γραμμές.
 *
 * Μόνο όταν η βάρδια δεν πούλησε τίποτα από αυτό. Αν το πακέτο τέλειωσε
 * ΜΕΣΑ στη βάρδια, τα νούμερα είναι ακριβώς αυτά που εξηγούν την πώληση και
 * πρέπει να μένουν ορατά για να ελεγχθεί - εκεί αρκεί η σήμανση «Τελείωσε»
 * δίπλα στο όνομα.
 *
 * Λαχεία ποτέ: μετράνε ανάποδα και δεν έχουν πακέτο από πίσω.
 */
export function packIsGone(
  row: PackRow,
  options: { isLottery?: boolean; soldThisShift?: unknown } = {}
): boolean {
  if (options.isLottery) return false;
  const sold = Number(options.soldThisShift ?? 0);
  if (Number.isFinite(sold) && sold !== 0) return false;
  return packWarning(row)?.state === 'finished';
}
