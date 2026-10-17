// How a till difference is divided between the business and the operator.
//
// Before this, `sync_shift_close_effects` charged the operator the WHOLE
// shortage and the configured tolerance did nothing but colour a banner red.
// The rule the Owner actually works to:
//
//   * A difference inside the tolerance is the cost of doing business. The
//     whole amount goes to the discrepancy ledger; the operator owes nothing.
//   * A shortage past the tolerance splits: the tolerance is absorbed, only
//     the excess is charged.
//   * A surplus is never charged and never credited - it lands in the ledger
//     as a negative cost, so a period's total nets out and the periodic
//     settlement from tips is one figure rather than two.
//
// `absorbed` is SIGNED on purpose: negative for an absorbed shortage,
// positive for a surplus. Summing it over a month gives what the ledger owes.
// `charged` is unsigned, because it becomes an amount owed.

export type DiscrepancySettlement = 'CHARGE' | 'PAID_CASH';

export interface DiscrepancySplit {
  /** The till difference as counted. Negative = short, positive = over. */
  discrepancy: number;
  /** The ledger's share, signed. */
  absorbed: number;
  /** What the operator owes. Never negative. */
  charged: number;
  /** A shortage deep enough to reach the operator. */
  exceedsTolerance: boolean;
}

// `+ 0` collapses negative zero. Without it an absorbed shortage of exactly
// nothing comes out as -0, which prints as "-0,00 €" and fails an === 0 check
// in anything comparing with Object.is.
function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100 + 0;
}

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : 0;
}

export function splitDiscrepancy(discrepancy: unknown, tolerance: unknown): DiscrepancySplit {
  const gap = round2(num(discrepancy));
  // A negative tolerance would charge more than the shortage.
  const limit = Math.max(0, round2(num(tolerance)));

  if (gap >= 0) {
    return { discrepancy: gap, absorbed: gap, charged: 0, exceedsTolerance: false };
  }

  const shortage = -gap;
  const absorbed = Math.min(shortage, limit);
  const charged = round2(shortage - absorbed);

  return {
    discrepancy: gap,
    absorbed: round2(-absorbed),
    charged,
    exceedsTolerance: charged > 0,
  };
}
