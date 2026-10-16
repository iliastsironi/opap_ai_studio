import { describe, expect, it } from 'vitest';
import {
  readSafeDrops,
  safeDropShiftFields,
  sortSafeDrops,
  totalSafeDrops,
} from '../lib/shiftSafeDrops.ts';

const drop = (amount: number, at: string, note?: string) => ({ amount, at, note });

describe('safe drops during a shift', () => {
  it('totals the deposits into the field the reconciliation already reads', () => {
    // bank_deposits is added back when working out what the drawer should
    // hold, so money in the safe is money the shift took, not money missing.
    const drops = [drop(500, '2026-10-16T09:00:00Z'), drop(250.5, '2026-10-16T15:00:00Z')];
    expect(totalSafeDrops(drops)).toBe(750.5);
    expect(safeDropShiftFields(drops)).toEqual({ bank_deposits: 750.5, safe_drop: 750.5 });
  });

  it('writes both names of the same figure', () => {
    // safe_drop and bank_deposits have been two names for one number since
    // before the list existed; anything reading either keeps working.
    const fields = safeDropShiftFields([drop(100, '2026-10-16T09:00:00Z')]);
    expect(fields.bank_deposits).toBe(fields.safe_drop);
  });

  it('is zero, not undefined, when nothing went to the safe', () => {
    expect(totalSafeDrops([])).toBe(0);
    expect(safeDropShiftFields([])).toEqual({ bank_deposits: 0, safe_drop: 0 });
  });

  it('reads back what a shift carries, ignoring anything malformed', () => {
    expect(
      readSafeDrops({
        safe_drops: [
          { amount: 500, at: '2026-10-16T09:00:00Z', note: 'πρωινό' },
          { amount: 0, at: '2026-10-16T10:00:00Z' },
          { amount: 'abc', at: '2026-10-16T11:00:00Z' },
          null,
        ],
      })
    ).toEqual([{ amount: 500, at: '2026-10-16T09:00:00Z', note: 'πρωινό', by: undefined }]);
  });

  it('reads a shift that has none', () => {
    expect(readSafeDrops({})).toEqual([]);
    expect(readSafeDrops(null)).toEqual([]);
    expect(readSafeDrops({ safe_drops: 'nonsense' })).toEqual([]);
  });

  it('orders by when the money moved, not when it was typed', () => {
    // A drop entered retroactively carries the time it actually happened, so
    // the list has to sort on that rather than on insertion order.
    const sorted = sortSafeDrops([
      drop(100, '2026-10-16T18:00:00Z'),
      drop(50, '2026-10-16T08:00:00Z'),
      drop(75, '2026-10-16T13:00:00Z'),
    ]);
    expect(sorted.map((d) => d.amount)).toEqual([50, 75, 100]);
  });

  it('does not accumulate a rounding error', () => {
    expect(totalSafeDrops([drop(0.1, 'a'), drop(0.2, 'b')])).toBe(0.3);
  });
});
