import { describe, expect, it } from 'vitest';
import {
  applyCancellation,
  piecesToBundles,
  standingOrderPieces,
} from '../lib/laikoCancellation.ts';

const LAIKO = { bundlePrice: 10 }; // πεντάδα at 2 € the ticket

describe('cancelling what the draw did not sell', () => {
  it('charges nothing when the whole shelf went back', () => {
    const c = applyCancellation({ remainingBundles: 40, cancelledBundles: 40, ...LAIKO });
    expect(c.chargeable).toBe(0);
    expect(c.chargeableAmount).toBe(0);
    expect(c.remainingAfter).toBe(0);
  });

  // The Owner's rule. Three πεντάδες that went back neither to the shelf nor
  // to OPAP were sold, and are charged like any other sale - the one figure
  // that can reveal a loss must not become the way to hide it.
  it('charges the difference when fewer went back than were held', () => {
    const c = applyCancellation({ remainingBundles: 40, cancelledBundles: 37, ...LAIKO });
    expect(c.chargeable).toBe(3);
    expect(c.chargeableAmount).toBe(30);
  });

  it('empties the shelf either way - the draw is over', () => {
    expect(applyCancellation({ remainingBundles: 40, cancelledBundles: 37, ...LAIKO }).remainingAfter).toBe(0);
    expect(applyCancellation({ remainingBundles: 40, cancelledBundles: 0, ...LAIKO }).remainingAfter).toBe(0);
  });

  it('charges the lot when nothing was cancelled at all', () => {
    const c = applyCancellation({ remainingBundles: 12, cancelledBundles: 0, ...LAIKO });
    expect(c.chargeable).toBe(12);
    expect(c.chargeableAmount).toBe(120);
  });

  it('flags cancelling more than the shelf held instead of hiding it', () => {
    const c = applyCancellation({ remainingBundles: 10, cancelledBundles: 14, ...LAIKO });
    expect(c.cancelledMoreThanHeld).toBe(true);
    expect(c.chargeable).toBe(0); // never negative, never a credit
  });

  it('stays quiet on an ordinary cancellation', () => {
    expect(applyCancellation({ remainingBundles: 40, cancelledBundles: 40, ...LAIKO }).cancelledMoreThanHeld).toBe(false);
  });

  it('counts in whole πεντάδες, whatever is typed', () => {
    const c = applyCancellation({ remainingBundles: '40', cancelledBundles: '37,8', ...LAIKO });
    expect(c.cancelled).toBe(37);
  });

  it('treats rubbish and blanks as nothing cancelled', () => {
    const c = applyCancellation({ remainingBundles: 40, cancelledBundles: '', ...LAIKO });
    expect(c.chargeable).toBe(40);
    expect(applyCancellation({ remainingBundles: 40, cancelledBundles: -5, ...LAIKO }).cancelled).toBe(0);
  });
});

describe('the standing order', () => {
  it('turns the shop’s 40 πεντάδες into what sits on the shelf', () => {
    expect(standingOrderPieces(40, 5)).toBe(200);
  });

  it('reads back the other way', () => {
    expect(piecesToBundles(200, 5)).toBe(40);
    expect(piecesToBundles(203, 5)).toBe(40); // three loose ones are not a πεντάδα
  });

  it('falls back to a πεντάδα when the size is missing', () => {
    expect(standingOrderPieces(40, undefined)).toBe(200);
    expect(standingOrderPieces(40, 0)).toBe(200);
  });

  it('is nothing until somebody sets it', () => {
    expect(standingOrderPieces(0, 5)).toBe(0);
    expect(standingOrderPieces(undefined, 5)).toBe(0);
  });
});
