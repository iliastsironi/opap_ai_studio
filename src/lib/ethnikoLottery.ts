/**
 * Το Εθνικό Λαχείο counts πεντάδες, and nothing else.
 *
 * Its serial advances once per πεντάδα - the whole five-share strip - at
 * 20 € each. That is the product, not a preference, and the figures already
 * on record were entered that way: a shift that went from 53 to 49 sold four
 * πεντάδες for 80 €.
 *
 * What went wrong is that the row never said so. It ships without a
 * bundleSize, which left it to `lottery_bundle_default`, a store-wide
 * default meant for ordinary Λαχεία rows - and that produced two different
 * wrong answers depending on which way it fell:
 *
 *   default off  -> bundleSize 0: a plain piece count. The arithmetic came
 *                   out right by accident, but every label called a πεντάδα
 *                   a κομμάτι.
 *   default on   -> bundleSize 5: the dual πεντάδες/κομμάτια entry, which
 *                   multiplies the price by five. 20 € per piece became
 *                   100 € per πεντάδα, and a loose-pieces box appeared for
 *                   a product that has no loose pieces.
 *
 * Worse, it flipped between the two from shift to shift - the live rows show
 * bundleSize 0 ten times, 5 five times and absent twice on the same game -
 * because a figure saved by one shift carries into the next while a row
 * rebuilt from the catalogue goes back to the default. That is the «έχει
 * αρχίσει να μετράει κι αυτό σε κομμάτια» the Owner reported.
 *
 * So the shape is pinned here instead, the way Λαϊκό Λαχείο's is. One unit,
 * one price, named correctly - and no dual tracking to turn on, because
 * there is no smaller unit to sell.
 *
 * Deliberately NOT modelled as bundleSize 5 with a 4 € piece price. The
 * arithmetic would agree on a whole πεντάδα, but every serial already
 * recorded counts πεντάδες, so reading them as pieces would quarter the
 * money on shifts that are closed and approved - 80 € of real August
 * takings would become 16 €.
 */

export const ETHNIKO_ROW_ID = 'scr_ethniko_x20';

/** What one πεντάδα sells for. */
export const ETHNIKO_BUNDLE_PRICE = 20;

export interface ShapedRow {
  id?: string;
  price?: number | string;
  bundleSize?: number;
  saleBundles?: string;
  salePieces?: string;
}

export function isEthnikoRow(row: ShapedRow | null | undefined): boolean {
  return !!row && row.id === ETHNIKO_ROW_ID;
}

/**
 * Forces the row back to one πεντάδα at 20 €.
 *
 * Unconditional, like applyLaikoDefaults: checking «is it already set»
 * would leave a stale 0 or 5 from a cached catalogue or an earlier shift
 * stuck there for good, which is the whole fault being fixed.
 */
export function applyEthnikoShape<T extends ShapedRow>(rows: T[]): T[] {
  return rows.map((row) =>
    isEthnikoRow(row)
      ? {
          ...row,
          price: ETHNIKO_BUNDLE_PRICE,
          // 0, not 5: the counted unit IS the πεντάδα, so there is no
          // second unit to split it into.
          bundleSize: 0,
          // Any dual-entry figures left behind by the five-piece spell
          // would be read as extra pieces on top of the serial.
          saleBundles: '',
          salePieces: '',
        }
      : row
  );
}

/**
 * The name of the unit this row counts, for the labels that otherwise all
 * say «κομμάτιο».
 */
export function lotteryUnitLabel(row: ShapedRow | null | undefined): string | null {
  return isEthnikoRow(row) ? 'πεντάδα' : null;
}

/** The plural, because «πεντάδα» + «ες» is not a Greek word. */
export function lotteryUnitLabelPlural(row: ShapedRow | null | undefined): string | null {
  return isEthnikoRow(row) ? 'πεντάδες' : null;
}

/** Whether the πεντάδες/κομμάτια toggle may be offered for this row. */
export function canToggleBundleTracking(row: ShapedRow | null | undefined): boolean {
  return !isEthnikoRow(row);
}
