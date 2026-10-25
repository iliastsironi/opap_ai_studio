/**
 * Οι αδιάθετοι λαχνοί του Λαϊκού, και η διαφορά που χρεώνεται.
 *
 * A λαϊκό draw does not sell out. On the day it is drawn, whatever is left
 * on the shelf is cancelled and sent back, and the shop owes nothing for it.
 * Until now the till had no way to say that: unsold tickets looked exactly
 * like sold ones, so the remaining stock was charged to whoever was on the
 * counter that evening.
 *
 * So the operator records how many πεντάδες they cancelled, and those come
 * off the balance without reaching the takings.
 *
 * The interesting case is when the two do not agree. If 40 πεντάδες were
 * left and 37 were cancelled, the other 3 did not go back and did not stay
 * on the shelf - which means they were sold, and the Owner's rule is that
 * they are charged exactly as any other sale. That is the whole point of
 * asking: a count that silently wrote off the difference would turn the one
 * figure capable of revealing a loss into a way of hiding it.
 *
 * Everything here is in πεντάδες, the unit the shop orders, counts and
 * cancels in.
 */

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === '') return 0;
  const parsed = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
};

const whole = (v: unknown): number => Math.max(0, Math.floor(num(v)));

export interface CancellationInput {
  /** Πεντάδες still on the shelf before the cancellation. */
  remainingBundles: unknown;
  /** Πεντάδες the operator sent back. */
  cancelledBundles: unknown;
  /** Τιμή πεντάδας. */
  bundlePrice: unknown;
}

export interface Cancellation {
  remaining: number;
  cancelled: number;
  /** Πεντάδες neither cancelled nor left: sold, and charged. */
  chargeable: number;
  /** What those come to. */
  chargeableAmount: number;
  /** The shelf is emptied either way - the draw is over. */
  remainingAfter: 0;
  /**
   * More was cancelled than the shelf held, which cannot happen. Left for
   * the screen to query rather than silently clamped, because the figure it
   * would clamp to is the one nobody checked.
   */
  cancelledMoreThanHeld: boolean;
}

export function applyCancellation(input: CancellationInput): Cancellation {
  const remaining = whole(input.remainingBundles);
  const cancelled = whole(input.cancelledBundles);
  const price = Math.max(0, num(input.bundlePrice));
  const chargeable = Math.max(0, remaining - cancelled);

  return {
    remaining,
    cancelled,
    chargeable,
    chargeableAmount: Math.round(chargeable * price * 100) / 100,
    remainingAfter: 0,
    cancelledMoreThanHeld: cancelled > remaining,
  };
}

/** Πεντάδες -> κομμάτια, the unit the rows themselves count in. */
export function bundlesToPieces(bundles: unknown, bundleSize: unknown): number {
  const size = whole(bundleSize) || 5;
  return whole(bundles) * size;
}

/** 40 πεντάδες standing order -> how many pieces that is on the shelf. */
export function standingOrderPieces(bundles: unknown, bundleSize: unknown): number {
  return bundlesToPieces(bundles, bundleSize);
}

/** Pieces back into the unit the shop speaks in. */
export function piecesToBundles(pieces: unknown, bundleSize: unknown): number {
  const size = whole(bundleSize) || 5;
  return Math.floor(whole(pieces) / size);
}

export const DEFAULT_STANDING_ORDER_BUNDLES = 0;
