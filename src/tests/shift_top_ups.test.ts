import { describe, expect, it } from 'vitest';
import { readTopUps, topUpsForLegacyFields, totalTopUps } from '../lib/shiftTopUps.ts';

describe('προσαυξήσεις as a list', () => {
  it('still reports a total the P&L can add from two fields', () => {
    // pnlService reads topup_1 and topup_2 and sums them. Whatever the list
    // holds, those two must come to the same figure.
    const list = ['50', '20', '30.5'];
    const legacy = topUpsForLegacyFields(list);
    expect(legacy.opening_topup_1 + legacy.opening_topup_2).toBe(totalTopUps(list));
    expect(totalTopUps(list)).toBe(100.5);
  });

  it('puts the first entry first and everything else behind it', () => {
    expect(topUpsForLegacyFields(['50', '20', '30'])).toEqual({
      opening_topup_1: 50,
      opening_topup_2: 50,
    });
  });

  it('matches the old two-field behaviour exactly for one or two entries', () => {
    expect(topUpsForLegacyFields(['40'])).toEqual({ opening_topup_1: 40, opening_topup_2: 0 });
    expect(topUpsForLegacyFields(['40', '15'])).toEqual({ opening_topup_1: 40, opening_topup_2: 15 });
    expect(topUpsForLegacyFields([])).toEqual({ opening_topup_1: 0, opening_topup_2: 0 });
  });

  it('does not accumulate a rounding error across entries', () => {
    const list = ['0.1', '0.2'];
    expect(totalTopUps(list)).toBe(0.3);
    expect(topUpsForLegacyFields(list).opening_topup_2).toBe(0.2);
  });

  it('reads a shift written before the list existed', () => {
    expect(readTopUps({ opening_topup_1: 50, opening_topup_2: 20 })).toEqual(['50', '20']);
    expect(readTopUps({ opening_topup_1: 50, opening_topup_2: 0 })).toEqual(['50']);
  });

  it('prefers the list when a shift has one', () => {
    expect(readTopUps({ opening_topups: [10, 20, 30], opening_topup_1: 10, opening_topup_2: 50 }))
      .toEqual(['10', '20', '30']);
  });

  it('offers one empty box when nothing has been added', () => {
    expect(readTopUps({})).toEqual(['']);
    expect(readTopUps(null)).toEqual(['']);
  });

  it('ignores nonsense rather than turning it into NaN', () => {
    expect(totalTopUps(['abc', '10', ''])).toBe(10);
  });
});
