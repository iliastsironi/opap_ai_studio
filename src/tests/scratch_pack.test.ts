import { describe, expect, it } from 'vitest';
import {
  packPieceCount, piecesLeftInPack, isValidPackCode, normalizePackCode,
} from '../lib/scratchPack.ts';

describe('how many tickets a pack holds', () => {
  it('divides the 300 € face value by the ticket price', () => {
    expect(packPieceCount(2)).toBe(150);
    expect(packPieceCount(5)).toBe(60);
    expect(packPieceCount(10)).toBe(30);
    expect(packPieceCount(1)).toBe(300);
  });

  it('gives nothing for a price that does not divide 300', () => {
    // A 7 € game has no defined pack size, and inventing one would charge the
    // shop for tickets that never existed.
    expect(packPieceCount(7)).toBeNull();
    expect(packPieceCount(0)).toBeNull();
    expect(packPieceCount(-5)).toBeNull();
    expect(packPieceCount(null)).toBeNull();
  });
});

describe('what the old pack still owes when a new one opens', () => {
  it('sells the rest of the pack, counting the last ticket', () => {
    // The Owner's example: a 2 € pack of 150 found at position 6 and finished
    // sells 144 - tickets 6 through 149 inclusive, 288 €.
    expect(piecesLeftInPack(2, 6)).toBe(144);
    expect(piecesLeftInPack(2, '6')).toBe(144);
  });

  it('sells the whole pack when the shift found it untouched', () => {
    expect(piecesLeftInPack(2, 0)).toBe(150);
    expect(piecesLeftInPack(2, '')).toBe(150);
    expect(piecesLeftInPack(5, 0)).toBe(60);
  });

  it('sells the last ticket alone', () => {
    expect(piecesLeftInPack(2, 149)).toBe(1);
  });

  it('never reports a negative sale past the end of the pack', () => {
    expect(piecesLeftInPack(2, 150)).toBe(0);
    expect(piecesLeftInPack(2, 999)).toBe(0);
  });

  it('asks rather than guesses for a non-standard price', () => {
    expect(piecesLeftInPack(7, 6)).toBeNull();
  });
});

describe('the pack code', () => {
  it('takes exactly seven digits', () => {
    expect(isValidPackCode('1234567')).toBe(true);
    expect(isValidPackCode(' 1234567 ')).toBe(true);
  });

  it('refuses anything else, because a mistyped code is untraceable', () => {
    expect(isValidPackCode('123456')).toBe(false);
    expect(isValidPackCode('12345678')).toBe(false);
    expect(isValidPackCode('12345A7')).toBe(false);
    expect(isValidPackCode('')).toBe(false);
    expect(isValidPackCode(null)).toBe(false);
  });

  it('strips what cannot belong in a code as it is typed', () => {
    expect(normalizePackCode('12-34 567')).toBe('1234567');
    expect(normalizePackCode('12345678901')).toBe('1234567');
    expect(normalizePackCode('abc')).toBe('');
  });
});

import { calculateRowQty, calculateRowTotal } from '../components/shifts/ScratchCalculatorTable.tsx';

// What the row must report once a pack has been finished and replaced mid
// shift: the old pack's tail AND the new pack's progress, in one figure.
describe('a row that changed packs during the shift', () => {
  const base = { id: 'scr_a', name: 'Σκρατς 2€', category: 'Σκρατς', price: 2 } as any;

  it('adds the finished pack to what the new one has sold', () => {
    // Found at 6, pack ran out (144 sold), new pack opened and sold to 10.
    const row = { ...base, closedPackQty: 144, startNo: '0', endNo: '10' };
    expect(calculateRowQty(row)).toBe(154);
    expect(calculateRowTotal(row)).toBe(308);
  });

  it('reports the finished pack even before the new one sells anything', () => {
    // The old behaviour reported 0 here and the 288 € vanished.
    const row = { ...base, closedPackQty: 144, startNo: '0', endNo: '' };
    expect(calculateRowQty(row)).toBe(144);
    expect(calculateRowTotal(row)).toBe(288);
  });

  it('leaves a row that never changed packs exactly as it was', () => {
    expect(calculateRowQty({ ...base, startNo: '6', endNo: '11' })).toBe(5);
    expect(calculateRowQty({ ...base, closedPackQty: 0, startNo: '6', endNo: '11' })).toBe(5);
  });

  it('adds up two packs finished in one shift', () => {
    const row = { ...base, closedPackQty: 144 + 150, startNo: '0', endNo: '3' };
    expect(calculateRowQty(row)).toBe(297);
  });

  it('ignores a negative or unusable carry rather than subtracting', () => {
    expect(calculateRowQty({ ...base, closedPackQty: -50, startNo: '0', endNo: '10' })).toBe(10);
    expect(calculateRowQty({ ...base, closedPackQty: NaN, startNo: '0', endNo: '10' })).toBe(10);
  });
});
