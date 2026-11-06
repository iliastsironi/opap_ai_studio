/**
 * Opening a new scratch pack, and what the old one still owes.
 *
 * A pack is sold through from its first ticket to its last, and a new one is
 * opened when the old is finished. The screen used to handle that by resetting
 * the row - new starting number, blank end - which threw away every ticket
 * sold between where the shift found the pack and where it ran out. A pack
 * opened at position 6 and finished mid-shift lost 144 tickets, 288 €, from
 * the day's sales.
 *
 * So closing a pack records its tail as sold, and the row then counts the new
 * pack from its beginning. Both show up in the shift's figures.
 *
 * The numbering counts the last ticket: a 2 € game is a 300 € pack of 150
 * tickets numbered 0 to 149, and finishing it from position 6 sells 144 -
 * 6 through 149 inclusive. That is NOT the «end minus start» the table uses
 * while a pack is open, where 6 → 11 means 5: there, 11 is the next ticket
 * still on the shelf, not one that was sold.
 */

import { PACKAGE_FACE_VALUE, packPieces } from './scratchBarcode.ts';

export { PACKAGE_FACE_VALUE };

/**
 * Πόσα δελτία κρατάει το πακέτο αυτού του παιχνιδιού.
 *
 * Ήταν το ΤΡΙΤΟ αντίγραφο του κανόνα των 300 € στο έργο, και το τελευταίο
 * που έμεινε να δίνει 6 δελτία στο Χ50 αντί για 15: από εδώ περνάει το
 * «Τελειώνει — 2 δελτία» που είδε ο Owner με το πακέτο στη θέση 4.
 *
 * Δεν υπολογίζει πια τίποτα - ρωτάει το lib/scratchBarcode.ts, όπου ο
 * κανόνας ζει μία φορά και το δηλωμένο μέγεθος του καταλόγου νικάει.
 */
export function packPieceCount(
  price: number | null | undefined,
  declaredPieces?: unknown
): number | null {
  return packPieces(price, declaredPieces);
}

/**
 * Tickets left in the pack from `startNo` to its end, all of them sold.
 *
 * Null when the game's price does not divide 300 - a 7 € game has no defined
 * pack size, and inventing one would charge the shop for tickets that never
 * existed. The caller has to ask instead.
 */
export function piecesLeftInPack(
  price: number | null | undefined,
  startNo: string | number | null | undefined,
  declaredPieces?: unknown
): number | null {
  const pieces = packPieceCount(price, declaredPieces);
  if (pieces === null) return null;

  const start = typeof startNo === 'number' ? startNo : parseInt(String(startNo ?? '').trim(), 10);
  const from = Number.isFinite(start) ? start : 0;

  // Past the end of the pack is not a negative sale.
  if (from >= pieces) return 0;
  return pieces - Math.max(0, from);
}

/**
 * A pack code as the warehouse knows it: exactly seven digits.
 *
 * Δεύτερος ορισμός του ίδιου κανόνα, και ΔΕΝ συμφωνούσε με τον πρώτο. Αυτός
 * έκανε μόνο trim· το lib/scratchBarcode πετάει κάθε μη-ψηφίο. Ένας κωδικός
 * «123-4567» - όπως τον δίνει ένας σαρωτής με διαχωριστικό, ή όπως τον
 * γράφει ένα χέρι - ήταν έγκυρος στην αποθήκη και άκυρος στο ταμείο.
 *
 * Παραδόξως το normalizePackCode από κάτω έκανε ήδη το σωστό: έκοβε τα
 * μη-ψηφία. Ο έλεγχος και η κανονικοποίηση του ΙΔΙΟΥ πεδίου διαφωνούσαν
 * μεταξύ τους μέσα στο ίδιο αρχείο.
 */
export { isValidPackCode } from './scratchBarcode.ts';

export function normalizePackCode(code: string | null | undefined): string {
  return String(code ?? '').replace(/\D/g, '').slice(0, 7);
}
