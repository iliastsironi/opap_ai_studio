import { describe, expect, it } from 'vitest';
import { shiftTypeOptions, resolveShiftType } from '../lib/shiftTypeOptions.ts';

describe('which shifts a store offers', () => {
  it('drops the afternoon on a two-shift store', () => {
    expect(shiftTypeOptions(2).map((o) => o.value)).toEqual(['MORNING', 'NIGHT', 'CUSTOM']);
  });

  it('offers all three on a three-shift store', () => {
    expect(shiftTypeOptions(3).map((o) => o.value))
      .toEqual(['MORNING', 'AFTERNOON', 'NIGHT', 'CUSTOM']);
  });

  it('keeps the extra shift everywhere', () => {
    // Not one of the day's regular shifts - the escape hatch for one that was
    // not planned. A shop with no label for it would pick a wrong one.
    for (const n of [2, 3]) {
      expect(shiftTypeOptions(n).some((o) => o.value === 'CUSTOM')).toBe(true);
    }
  });

  it('behaves as three when the store has no template yet', () => {
    for (const n of [null, undefined, 0, NaN]) {
      expect(shiftTypeOptions(n as any)).toHaveLength(4);
    }
  });
});

describe('keeping the selection valid', () => {
  it('leaves a selection the store still offers', () => {
    expect(resolveShiftType('NIGHT', 2)).toBe('NIGHT');
    expect(resolveShiftType('AFTERNOON', 3)).toBe('AFTERNOON');
  });

  it('falls back when the chosen shift is no longer offered', () => {
    // Switching stores with «Απογευματινή» selected would otherwise write a
    // shift type the store does not run, behind a blank select.
    expect(resolveShiftType('AFTERNOON', 2)).toBe('MORNING');
  });

  it('keeps the extra shift on a two-shift store', () => {
    expect(resolveShiftType('CUSTOM', 2)).toBe('CUSTOM');
  });
});
