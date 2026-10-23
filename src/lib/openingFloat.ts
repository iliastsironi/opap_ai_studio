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
  /**
   * Προσαυξήσεις already made today, by any shift of this day.
   *
   * Money added to the drawer part-way through a shift stays there: the
   * envelope takes what is above the float, and a top-up raises the float.
   * So a later shift of the same day opens on a drawer holding it, and
   * offering that shift the day's original figures leaves it short by the
   * whole amount.
   *
   * It is reported on its own rather than folded into either box. A
   * προσαύξηση may be notes or coins and nobody records which, so putting it
   * in one of them states something nobody knows. It is a third figure in
   * the float, which is exactly how the closing screen has always modelled
   * it: notes + coins + top-ups.
   *
   * Inherited, never re-declared: the shift does not record a top-up of its
   * own, so the monthly P&L - which sums the day's shifts - counts each one
   * once. Operators had been retyping the figure on the evening shift to
   * make the till balance, which is why every day in the live data that has
   * a top-up shows it twice.
   */
  topUpsToday?: number | null;
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
  /**
   * How much of `notes` is a προσαύξηση inherited from earlier today, so the
   * screen can say so rather than show a float that grew for no visible
   * reason.
   */
  topUpsInherited: number;
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100 + 0;

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
    // The day's top-ups ride with the notes. They are in the drawer: the
    // envelope only ever takes what is above the float, and a top-up is
    // float. Leaving them out is what made the evening open short by the
    // whole amount and pushed operators into retyping the figure.
    const topUps = Math.max(0, num(dayOpening!.topUpsToday));
    return {
      notes: num(dayOpening!.notes),
      coins: dayCoins > 0 ? dayCoins : configured.coins,
      carriedOver: true,
      // Beside the other two, not inside them. It still has to be in the
      // float the shift opens on - the money is in the drawer, because the
      // envelope only ever takes what is above the float - so every caller
      // adds the three together.
      topUpsInherited: topUps,
    };
  }

  // The day's first shift. The notes always reset to the float: last night's
  // went to the safe in the envelope.
  if (!previousWasCounted(previous)) {
    // Nothing to carry. The configured float beats a zero that only means
    // «the last shift never did anything».
    return { notes: configured.notes, coins: configured.coins, carriedOver: false, topUpsInherited: 0 };
  }

  if (configured.morningCoinsCarryOver === false) {
    return { notes: configured.notes, coins: configured.coins, carriedOver: false, topUpsInherited: 0 };
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
    // Overnight. Yesterday's top-ups left in yesterday's last envelope.
    topUpsInherited: 0,
  };
}
