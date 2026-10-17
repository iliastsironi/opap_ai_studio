/**
 * Ο φάκελος: the money that leaves the till at the end of a shift.
 *
 * The drawer carries a fixed float - «πάγιο κεφάλαιο», 1000 € - which runs
 * from day to day and never goes anywhere. Everything above it is counted
 * into an envelope and handed to the supervisor. The envelope is the shift's
 * takings; the float is just the change the next shift needs.
 *
 * It is a plain subtraction, but it is the number the person receiving the
 * envelope checks against what is inside it, so it belongs on screen rather
 * than in somebody's head at the end of a long count.
 *
 * Distinct from a safe drop, which is money moved mid-shift and is the
 * Owner's choice to record; this is what is left at the close.
 */

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round(n * 100) / 100;

export interface EnvelopeInput {
  /** The drawer as counted at the close. */
  countedCash: number | string | null | undefined;
  /** The float that stays behind - notes plus the coins carried. */
  fixedFloat: number | string | null | undefined;
  /** Cash already moved to the safe during the shift, if any. */
  safeDrops?: number | string | null | undefined;
}

export interface Envelope {
  /** Handed over at the close. */
  amount: number;
  /** Stays in the drawer for the next shift. */
  retained: number;
  /** Everything that left the till this shift, safe drops included. */
  totalOut: number;
  /** True when the drawer holds less than the float it is meant to keep. */
  isShort: boolean;
}

export function calculateEnvelope(input: EnvelopeInput): Envelope {
  const counted = num(input.countedCash);
  const float = num(input.fixedFloat);
  const drops = num(input.safeDrops);

  // Never negative: a drawer below its float is a shortage, not an envelope
  // owed back to the till, and the discrepancy is where that gets reported.
  const amount = round2(Math.max(0, counted - float));

  return {
    amount,
    retained: round2(Math.min(counted, float)),
    totalOut: round2(amount + drops),
    isShort: counted < float,
  };
}
