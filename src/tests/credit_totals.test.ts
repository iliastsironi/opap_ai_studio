import { describe, expect, it } from 'vitest';
import { creditTotals } from '../lib/creditTotals.ts';

const granted = (amount: number) => ({ type: 'GRANTED', amount });
const collected = (amount: number) => ({ type: 'COLLECTED', amount });

describe('credits across a day’s shifts', () => {
  it('counts what this shift recorded', () => {
    expect(creditTotals([granted(48), collected(18)])).toEqual({ granted: 48, collected: 18 });
  });

  it('counts what it inherited as well', () => {
    // The bug: the morning's credits were shown on the evening's screen and
    // left out of its arithmetic, so the till reconciled as though they had
    // never happened.
    expect(creditTotals([granted(5)], [granted(48), collected(18)]))
      .toEqual({ granted: 53, collected: 18 });
  });

  it('reads a shift with nothing of its own straight off the inherited list', () => {
    expect(creditTotals([], [granted(48), collected(18)]))
      .toEqual({ granted: 48, collected: 18 });
  });

  it('keeps the two directions apart', () => {
    expect(creditTotals([granted(100), collected(30), granted(20)]))
      .toEqual({ granted: 120, collected: 30 });
  });

  it('ignores anything that is neither', () => {
    expect(creditTotals([{ type: 'WAIVED', amount: 500 }, granted(10)]))
      .toEqual({ granted: 10, collected: 0 });
  });

  it('survives missing lists and unparsable amounts', () => {
    expect(creditTotals([])).toEqual({ granted: 0, collected: 0 });
    expect(creditTotals([granted(10)], undefined)).toEqual({ granted: 10, collected: 0 });
    expect(creditTotals([{ type: 'GRANTED', amount: null }])).toEqual({ granted: 0, collected: 0 });
    expect(creditTotals([{ type: 'GRANTED', amount: '18.50' as any }]).granted).toBe(18.5);
  });

  it('rounds to cents rather than carrying float noise', () => {
    expect(creditTotals([granted(0.1), granted(0.2)]).granted).toBe(0.3);
  });
});
