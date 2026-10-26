import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SAFE_DIRECTION,
  SAFE_LABELS,
  normalizeSafeDirection,
  safeAmountOut,
  safeSignedAmount,
} from '../lib/safeDirection.ts';

describe('an agency drops money into the safe', () => {
  it('adds it back: it left the till but is not missing', () => {
    expect(safeSignedAmount(500, 'DROP')).toBe(500);
  });

  it('counts it as money that left the till', () => {
    expect(safeAmountOut(500, 'DROP')).toBe(500);
  });

  it('is what every store does unless told otherwise', () => {
    expect(DEFAULT_SAFE_DIRECTION).toBe('DROP');
    expect(normalizeSafeDirection(undefined)).toBe('DROP');
    expect(normalizeSafeDirection(null)).toBe('DROP');
    expect(normalizeSafeDirection('ΟΥΠΣ')).toBe('DROP');
  });
});

describe('a PLAY hall takes money out of the safe', () => {
  // The machines pay out more than they take, so cash walks IN from the
  // shop's own safe. Adding it back the agency's way credits the hall with
  // money it never made.
  it('takes it off instead of adding it', () => {
    expect(safeSignedAmount(500, 'WITHDRAW')).toBe(-500);
  });

  it('counts as nothing leaving the till, however large', () => {
    expect(safeAmountOut(500, 'WITHDRAW')).toBe(0);
  });

  it('turns a 500 drop into a 1000 swing', () => {
    expect(safeSignedAmount(500, 'DROP') - safeSignedAmount(500, 'WITHDRAW')).toBe(1000);
  });
});

describe('figures that are not figures', () => {
  it('reads nothing as nothing, in both directions', () => {
    for (const d of ['DROP', 'WITHDRAW']) {
      expect(safeSignedAmount(null, d)).toBe(0);
      expect(safeSignedAmount('', d)).toBe(0);
      expect(safeSignedAmount('ουπς', d)).toBe(0);
      expect(safeAmountOut(undefined, d)).toBe(0);
    }
  });

  // A negative safe movement is not a movement in the other direction - the
  // direction is the store's setting, not a property of one amount.
  it('refuses to flip direction via a negative amount', () => {
    expect(safeSignedAmount(-500, 'DROP')).toBe(0);
    expect(safeSignedAmount(-500, 'WITHDRAW')).toBe(0);
  });

  it('never produces a negative zero', () => {
    // «-0,00» on a screen, and -0 !== 0 under Object.is, which a test or a
    // comparison elsewhere would trip over.
    expect(Object.is(safeSignedAmount(0, 'WITHDRAW'), 0)).toBe(true);
  });

  it('rounds to the cent', () => {
    expect(safeSignedAmount(10.005, 'DROP')).toBe(10.01);
  });
});

describe('what the operator is told', () => {
  it('names the movement the way that shop does it', () => {
    expect(SAFE_LABELS.DROP.title).toContain('Safe Drop');
    expect(SAFE_LABELS.WITHDRAW.title).toContain('Ανάληψη');
    expect(SAFE_LABELS.WITHDRAW.hint).toContain('Δεν είναι έσοδο');
  });
});
