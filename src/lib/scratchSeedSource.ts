/**
 * Where a blank scratch row gets its opening position from.
 *
 * The closing screen fills in a game whose row has no αρχικό - one the
 * catalogue lists that this shift never got a row for. What it fills it with
 * depends on where the shift sits in its day, and the two answers are
 * different numbers:
 *
 *   the day's first shift  takes the previous shift's CLOSING serial. That
 *                          is the overnight handover: the shop was shut and
 *                          the pack is where the night left it.
 *   any later shift        takes the DAY's OPENING serial, because within a
 *                          day the figures on screen are day-to-date. The
 *                          evening continues one count that began in the
 *                          morning rather than starting its own.
 *
 * Getting that wrong is visible: on 8/9 the day opened «Σκρατς League» at 29
 * and the morning sold one to 30. Seeded from the morning, the evening's row
 * said 30 and reported four tickets sold where the day had sold five.
 *
 * Same rule for every game, which is the point - a game somebody adds to the
 * catalogue tomorrow behaves like the ones that shipped with it.
 */

export interface SeedRow {
  id?: string;
  name?: string;
  category?: string;
  startNo?: unknown;
  endNo?: unknown;
}

export interface SeedSource {
  /** What the day's first shift opened on, from shift_day_opening. */
  dayOpeningRows?: SeedRow[] | null;
  /** When the day's first shift opened. */
  dayFirstOpenedAt?: string | null;
  /** What the immediately previous shift declared, from the handover. */
  previousRows?: SeedRow[] | null;
  /** When THIS shift opened. */
  openedAt?: string | null;
}

const sameMoment = (a?: string | null, b?: string | null): boolean => {
  if (!a || !b) return false;
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
};

/**
 * True when this shift is the one that opened the day, so there is no
 * earlier shift of its own day to continue.
 */
export function isDayFirstShift(source: SeedSource): boolean {
  if (!source.dayFirstOpenedAt) return true;
  return sameMoment(source.dayFirstOpenedAt, source.openedAt);
}

/**
 * The rows to read a handover position out of, with that position already in
 * `endNo` so one reader serves both cases.
 *
 * For a continuing shift the day's OPENING serial is the handover, so it is
 * moved into endNo - exactly what continueDayScratchInventory does when a
 * shift is created.
 */
export function seedRowsFor(source: SeedSource): SeedRow[] {
  if (isDayFirstShift(source)) return source.previousRows ?? [];

  const dayRows = source.dayOpeningRows ?? [];
  if (dayRows.length === 0) {
    // No day opening to continue. Falling back to the previous shift is
    // better than leaving the row blank, and it is what a day with one
    // shift would have given anyway.
    return source.previousRows ?? [];
  }
  return dayRows.map((r) => ({ ...r, endNo: r.startNo }));
}
