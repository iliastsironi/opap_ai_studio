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

/** A pack's face value in euro - what every OPAP scratch pack is worth. */
export const PACKAGE_FACE_VALUE = 300;

/** How many tickets a pack of this game holds, or null if the price is non-standard. */
export function packPieceCount(price: number | null | undefined): number | null {
  const p = Number(price);
  if (!Number.isFinite(p) || p <= 0) return null;
  const pieces = PACKAGE_FACE_VALUE / p;
  return Number.isInteger(pieces) ? pieces : null;
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
  startNo: string | number | null | undefined
): number | null {
  const pieces = packPieceCount(price);
  if (pieces === null) return null;

  const start = typeof startNo === 'number' ? startNo : parseInt(String(startNo ?? '').trim(), 10);
  const from = Number.isFinite(start) ? start : 0;

  // Past the end of the pack is not a negative sale.
  if (from >= pieces) return 0;
  return pieces - Math.max(0, from);
}

/**
 * A pack code as the warehouse will know it: exactly seven digits.
 *
 * Checked now even though the warehouse does not exist yet. A mistyped code
 * recorded today is a pack nobody can trace tomorrow, and the shape is the
 * only thing that can be checked without the stock list.
 */
export function isValidPackCode(code: string | null | undefined): boolean {
  return /^\d{7}$/.test(String(code ?? '').trim());
}

export function normalizePackCode(code: string | null | undefined): string {
  return String(code ?? '').replace(/\D/g, '').slice(0, 7);
}
