import { describe, expect, it } from 'vitest';
import { discrepancyTone, discrepancyClasses } from '../lib/discrepancyTone.ts';

const TOL = 2;

describe('a surplus', () => {
  it('is green, because it is never charged to anybody', () => {
    expect(discrepancyTone(0.06, TOL)).toBe('surplus');
    expect(discrepancyClasses(0.06, TOL).text).toContain('emerald');
  });

  it('stays green past the tolerance', () => {
    // The Owner's rule. A big surplus is usually a miscount, and the colour
    // will not say so - the figure and its sign still do.
    expect(discrepancyTone(50, TOL)).toBe('surplus');
  });

  it('covers an exactly balanced till', () => {
    expect(discrepancyTone(0, TOL)).toBe('surplus');
  });
});

describe('a shortage inside the tolerance', () => {
  it('is orange - missing, but within the day’s noise', () => {
    expect(discrepancyTone(-1.42, TOL)).toBe('within');
    expect(discrepancyClasses(-1.42, TOL).text).toContain('amber');
  });

  it('includes a shortage exactly at the limit', () => {
    expect(discrepancyTone(-2, TOL)).toBe('within');
  });
});

describe('a shortage past the tolerance', () => {
  it('is red - this is the one that reaches a record and an alert', () => {
    expect(discrepancyTone(-2.01, TOL)).toBe('over');
    expect(discrepancyTone(-5.58, TOL)).toBe('over');
    expect(discrepancyClasses(-5.58, TOL).text).toContain('rose');
  });

  it('treats a store with no tolerance as having none', () => {
    expect(discrepancyTone(-0.01, 0)).toBe('over');
    expect(discrepancyTone(-0.01, undefined)).toBe('over');
  });

  it('does not let a negative tolerance widen anything', () => {
    expect(discrepancyTone(-0.01, -100)).toBe('over');
  });
});

describe('the real shifts on record', () => {
  it('colours them the way the Owner described', () => {
    // From the live rows, against a 2 EUR tolerance.
    const cases: Array<[number, string]> = [
      [0.06, 'surplus'],   // 1/9 morning
      [3.09, 'surplus'],   // 5/9 night
      [-1.42, 'within'],
      [-5.58, 'over'],     // 1/9 night
      [-6.08, 'over'],     // 5/9 morning
    ];
    for (const [d, tone] of cases) expect(discrepancyTone(d, TOL)).toBe(tone);
  });
});

describe('junk in', () => {
  it('reads as balanced rather than throwing', () => {
    expect(discrepancyTone(undefined, TOL)).toBe('surplus');
    expect(discrepancyTone('όχι αριθμός', TOL)).toBe('surplus');
  });
});
