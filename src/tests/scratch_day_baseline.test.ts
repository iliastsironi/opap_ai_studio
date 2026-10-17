import { describe, expect, it } from 'vitest';
import { ownScratchSales, readScratchDayBaseline } from '../lib/scratchDayBaseline.ts';

// The Owner's worked example, in money: a 2 € game at 040 opening, shifts
// closing at 075 / 110 / 130, so 35 / 35 / 20 pieces sold - 70 / 70 / 40 €.
// On screen each shift shows the DAY's running figure; what is stored is its
// own, so the day still adds up to 140 €.
describe('the day’s running scratch figure versus one shift’s own', () => {
  it('turns each shift’s cumulative reading into its own sales', () => {
    expect(ownScratchSales(70, 0)).toBe(70);    // morning:   040 -> 075
    expect(ownScratchSales(140, 70)).toBe(70);  // afternoon: 040 -> 110
    expect(ownScratchSales(180, 140)).toBe(40); // night:     040 -> 130
  });

  it('keeps the day’s total equal to the last shift’s cumulative', () => {
    const own = [ownScratchSales(70, 0), ownScratchSales(140, 70), ownScratchSales(180, 140)];
    expect(own.reduce((a, b) => a + b, 0)).toBe(180);
  });

  it('never reports a negative sale when a serial is mistyped', () => {
    // A cumulative below the baseline means the end serial is wrong. Reporting
    // -30 would quietly reduce the day's takings; the table's own validation
    // is what tells the operator.
    expect(ownScratchSales(40, 70)).toBe(0);
  });

  it('treats a missing baseline as the day’s first shift', () => {
    expect(readScratchDayBaseline(undefined)).toBe(0);
    expect(readScratchDayBaseline({})).toBe(0);
    expect(readScratchDayBaseline({ scratch_day_baseline: null })).toBe(0);
    expect(readScratchDayBaseline({ scratch_day_baseline: '70.00' })).toBe(70);
    // A negative baseline would inflate every later shift.
    expect(readScratchDayBaseline({ scratch_day_baseline: -50 })).toBe(0);
  });

  it('rounds to cents rather than carrying float noise', () => {
    expect(ownScratchSales(0.3, 0.1)).toBe(0.2);
  });
});
