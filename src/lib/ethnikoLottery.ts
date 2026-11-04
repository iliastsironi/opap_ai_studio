/**
 * Το Εθνικό Λαχείο: 20 € η πεντάδα, 4 € το κομμάτι.
 *
 * Ο αριθμός στο βιβλίο προχωράει ΑΝΑ ΚΟΜΜΑΤΙ. Ο Owner το είπε καθαρά,
 * κοιτώντας το ταμείο: «το έχουμε σε πεντάδες αλλά μετράει κομμάτια και
 * χρεώνει 20 € το τεμάχιο, ενώ κανονικά είναι 20 € η πεντάδα, δηλαδή 4 €
 * ανά κομμάτι».
 *
 * This file used to assert the opposite - that one tick of the serial WAS a
 * whole πεντάδα - and pinned the row at 20 € against a single unit so the
 * arithmetic would follow. Every tick therefore charged 20 €, which is five
 * times what a κομμάτι costs. A shift that went 84 -> 80 sold four tickets
 * for 16 € and was billed 80 €.
 *
 * The old reasoning is worth keeping visible, because it was not careless:
 * the recorded serials move in small steps (53 -> 49, 48 -> 47) and reading
 * those as πεντάδες made the money look plausible. It was inferred from the
 * numbers rather than asked, and the numbers fit both readings. The shop
 * knows which one its ticket book does.
 *
 *   price      4 €, ανά ΚΟΜΜΑΤΙ - what one tick of the serial costs
 *   bundleSize 5 κομμάτια η πεντάδα, so a πεντάδα is 4 x 5 = 20 €
 *
 * Still pinned rather than left to `lottery_bundle_default`, for the reason
 * it always was: the store-wide default flipped this row between shapes from
 * shift to shift - the live rows show bundleSize 0 ten times, 5 five times
 * and absent twice on the same game - because a figure saved by one shift
 * carries into the next while a row rebuilt from the catalogue goes back to
 * the default.
 *
 * Το κατάστημα το μετράει σε πεντάδες (isUnitLocked in lotteryUnits.ts), so
 * the till shows one column at 20 € η πεντάδα. That is a label on the price,
 * not a change to it: the box still counts the κομμάτια the book counts.
 */

export const ETHNIKO_ROW_ID = 'scr_ethniko_x20';

/** Τι κοστίζει ένα κομμάτι - ένα βήμα του αριθμού. */
export const ETHNIKO_PIECE_PRICE = 4;

/** Πόσα κομμάτια έχει η πεντάδα. */
export const ETHNIKO_BUNDLE_SIZE = 5;

/** What one πεντάδα sells for. Derived, never stored as the row's price. */
export const ETHNIKO_BUNDLE_PRICE = ETHNIKO_PIECE_PRICE * ETHNIKO_BUNDLE_SIZE;

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
 * Forces the row back to 4 € το κομμάτι, πέντε κομμάτια η πεντάδα.
 *
 * Unconditional, like applyLaikoDefaults: checking «is it already set»
 * would leave a stale 20 € from a cached catalogue or an earlier shift
 * stuck there for good, which is the whole fault being fixed.
 */
export function applyEthnikoShape<T extends ShapedRow>(rows: T[]): T[] {
  return rows.map((row) =>
    isEthnikoRow(row)
      ? {
          ...row,
          price: ETHNIKO_PIECE_PRICE,
          bundleSize: ETHNIKO_BUNDLE_SIZE,
          // Any dual-entry figures left behind would be read as extra
          // pieces on top of the serial. The shop counts this one in
          // πεντάδες, so the dual boxes are not shown at all.
          saleBundles: '',
          salePieces: '',
        }
      : row
  );
}

/**
 * The name of the unit this row's PRICE is quoted in, for the labels that
 * otherwise all say «κομμάτιο».
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
