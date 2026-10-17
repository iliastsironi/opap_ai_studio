/**
 * What a shift's drawer starts with.
 *
 * The rule the agency works to, which is NOT what this file used to do:
 *
 *   The till runs on a fixed float - «πάγιο κεφάλαιο», 1000 € - that carries
 *   from day to day. At every close everything above the float is counted
 *   into an envelope and handed over, so the drawer is back on the float by
 *   the time the next operator opens it. The day's opening figures are
 *   therefore set ONCE, by the first shift of the day, and every later shift
 *   of that same day opens on exactly the same numbers: it is a continuation
 *   of one count, not a fresh one.
 *
 *   Only across the night does a close feed an opening, and only the coins:
 *   the notes went to the safe in the envelope, while nobody counts the ψιλά
 *   out and banks them - they sit in the drawer overnight.
 *
 * What this replaced: a later shift carried the previous shift's counted
 * cash, so the afternoon opened on «800 notes, 12,37 coins» - the whole
 * morning's takings - when the money had physically left in an envelope. The
 * old comment said the drawer «has not been emptied between them», and that
 * is the assumption that was wrong.
 *
 * Note what is NOT a parameter any more: whether this is the morning. A day's
 * first shift starts on the float whatever it is called - a store that opens
 * at 15:00 is still starting its day - and every shift after it continues the
 * day. Keeping `isMorning` would have been a parameter that no longer changes
 * the answer.
 */

export interface PreviousClose {
  countedCash?: number | null;
  openingCash?: number | null;
  /** Notes and coins as actually counted, when the shift broke them down. */
  notes?: number | null;
  coins?: number | null;
}

/**
 * What the first shift of today opened on, from shift_day_opening() (0033).
 * Null when this shift IS the first of the day.
 */
export interface DayOpening {
  notes?: number | null;
  coins?: number | null;
}

export interface ConfiguredFloat {
  notes: number;
  coins: number;
  /**
   * Whether the day's first shift inherits the night's coins.
   *
   * Depends on how the shop runs. If the ψιλά stay in the drawer overnight,
   * the morning starts on what was left and counting out a fixed figure would
   * be inventing one. If the drawer is emptied and a prepared float goes in,
   * last night's coins are in the safe and carrying them would measure the
   * till against money that is not there.
   *
   * Undefined behaves as true, which is the behaviour that was running before
   * this became a choice.
   */
  morningCoinsCarryOver?: boolean;
}

export interface OpeningFloat {
  notes: number;
  coins: number;
  /**
   * True when the figures are the day's established opening rather than this
   * operator's to set, so the UI may lock them and say where they came from.
   */
  carriedOver: boolean;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Whether the previous shift left anything behind worth carrying. */
export function previousWasCounted(previous: PreviousClose | null | undefined): boolean {
  if (!previous) return false;
  return num(previous.countedCash) > 0 || num(previous.openingCash) > 0;
}

/** Whether today already has an opening for a later shift to continue. */
export function dayAlreadyOpened(day: DayOpening | null | undefined): boolean {
  if (!day) return false;
  return num(day.notes) + num(day.coins) > 0;
}

export function resolveOpeningFloat(
  previous: PreviousClose | null | undefined,
  configured: ConfiguredFloat,
  dayOpening?: DayOpening | null
): OpeningFloat {
  // Already a shift today: continue its opening. This comes before everything
  // else deliberately - the day's figures are not up for renegotiation at
  // 15:00, which is the whole point of the rule.
  if (dayAlreadyOpened(dayOpening)) {
    // Coins get the same treatment they get overnight. A day's opening
    // recording zero coins is not «the day started with an empty coin tray»,
    // it is an opening where nobody broke the figure down - the live data has
    // exactly that, a 101499 shift opened on 200 notes and a flat 0 for coins
    // - and handing 0,00 to every later shift of that day would put an
    // operator at a store configured for 50 in front of a tray that does have
    // ψιλά in it.
    const dayCoins = num(dayOpening!.coins);
    return {
      notes: num(dayOpening!.notes),
      coins: dayCoins > 0 ? dayCoins : configured.coins,
      carriedOver: true,
    };
  }

  // The day's first shift. The notes always reset to the float: last night's
  // went to the safe in the envelope.
  if (!previousWasCounted(previous)) {
    // Nothing to carry. The configured float beats a zero that only means
    // «the last shift never did anything».
    return { notes: configured.notes, coins: configured.coins, carriedOver: false };
  }

  if (configured.morningCoinsCarryOver === false) {
    return { notes: configured.notes, coins: configured.coins, carriedOver: false };
  }

  // Carrying, but only what was actually counted. A close recording zero
  // coins is not a handover of an empty drawer, it is a close where nobody
  // counted the ψιλά - the live data has exactly that, an August close whose
  // denominations hold notes and no coin keys at all - and starting on zero
  // would mean the configured float never applies at the one store with any
  // history behind it.
  const carriedCoins = num(previous!.coins);
  return {
    notes: configured.notes,
    coins: carriedCoins > 0 ? carriedCoins : configured.coins,
    carriedOver: false,
  };
}
