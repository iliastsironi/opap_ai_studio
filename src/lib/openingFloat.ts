/**
 * What a shift's drawer starts with.
 *
 * Three things decide it: the store's configured float, what the previous
 * shift actually closed on, and whether this is the morning.
 *
 * The notes reset each morning, because the night's takings go to the safe.
 * The coins do not - nobody counts the ψιλά out and banks them, they sit in
 * the drawer overnight - so they carry over.
 *
 * The case that matters, and the one that was wrong: a previous shift that
 * counted nothing. A shift opened and never used closes on zero, and carrying
 * that zero over wiped the configured float, putting «Κέρματα 0,00» in front
 * of an operator at a store configured for 50.
 */

export interface PreviousClose {
  countedCash?: number | null;
  openingCash?: number | null;
  /** Notes and coins as actually counted, when the shift broke them down. */
  notes?: number | null;
  coins?: number | null;
}

export interface ConfiguredFloat {
  notes: number;
  coins: number;
}

export interface OpeningFloat {
  notes: number;
  coins: number;
  /** True when the figures came from a real previous count, so the UI may
   *  present them as carried over and lock them. */
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

export function resolveOpeningFloat(
  isMorning: boolean,
  previous: PreviousClose | null | undefined,
  configured: ConfiguredFloat
): OpeningFloat {
  const counted = previousWasCounted(previous);

  if (!counted) {
    // Nothing to carry. The configured float beats a zero that only means
    // «the last shift never did anything».
    return { notes: configured.notes, coins: configured.coins, carriedOver: false };
  }

  if (isMorning) {
    return { notes: configured.notes, coins: num(previous!.coins), carriedOver: false };
  }

  return { notes: num(previous!.notes), coins: num(previous!.coins), carriedOver: true };
}
