import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRATCH_PRESETS,
  applyLotteryProductShapes,
  applyLotteryUnits,
  calculateRowTotal,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

// The real catalogue, shaped the way the till shapes it on load, so the
// figures here are the ones a shop is actually charged.
const preset = (id: string): ScratchTicketRow => {
  const row = DEFAULT_SCRATCH_PRESETS.find((r) => r.id === id);
  if (!row) throw new Error(`no preset ${id}`);
  return applyLotteryProductShapes([{ ...row }])[0];
};

/** Pieces taken off the shelf. A λαχείο's figures ARE remaining stock. */
const sold = (row: ScratchTicketRow, pieces: number): ScratchTicketRow => ({
  ...row,
  startNo: '100',
  endNo: String(100 - pieces),
});

// The Owner's own figures, given from the counter.
describe('what a πεντάδα costs', () => {
  it('Ειδική Έκδοση χ5: πεντάδα 5 €', () => {
    expect(calculateRowTotal(sold(preset('scr_eidiki_x5'), 5))).toBe(5);
  });

  it('Ειδική Έκδοση χ10: πεντάδα 10 €', () => {
    expect(calculateRowTotal(sold(preset('scr_eidiki_x10'), 5))).toBe(10);
  });

  it('Εθνικό: πεντάδα 20 €', () => {
    expect(calculateRowTotal(sold(preset('scr_ethniko_x20'), 1))).toBe(20);
  });

  it('Λαϊκό: πεντάδα 10 €', () => {
    expect(calculateRowTotal(sold(preset('scr_laiko'), 5))).toBe(10);
  });
});

describe('what a κομμάτι costs', () => {
  it('Ειδική Έκδοση χ5: κομμάτι 1 €', () => {
    expect(calculateRowTotal(sold(preset('scr_eidiki_x5'), 1))).toBe(1);
  });

  it('Ειδική Έκδοση χ10: κομμάτι 2 €', () => {
    expect(calculateRowTotal(sold(preset('scr_eidiki_x10'), 1))).toBe(2);
  });

  it('Λαϊκό: κομμάτι 2 €', () => {
    expect(calculateRowTotal(sold(preset('scr_laiko'), 1))).toBe(2);
  });

  // Sold by the piece alone - there is no πεντάδα behind it.
  it('Πρωτοχρονιάτικο: κομμάτι 5 €, και καμία πεντάδα', () => {
    expect(calculateRowTotal(sold(preset('scr_protochroniatiko'), 1))).toBe(5);
    expect(preset('scr_protochroniatiko').bundleSize).toBe(0);
  });
});

describe('choosing a unit never changes what a sale costs', () => {
  const lotteries = ['scr_eidiki_x5', 'scr_eidiki_x10', 'scr_protochroniatiko', 'scr_ethniko_x20', 'scr_laiko'];

  for (const id of lotteries) {
    it(`${id}: ίδια κομμάτια, ίδια λεφτά`, () => {
      const base = sold(preset(id), 5);
      const asPieces = applyLotteryUnits([base], { [id]: 'PIECES' })[0];
      const asBundles = applyLotteryUnits([base], { [id]: 'BUNDLES' })[0];
      // The unit names what the price is for. It is not a multiplier: the
      // same five tickets cost the same whichever way they are counted.
      expect(calculateRowTotal(asBundles)).toBe(calculateRowTotal(asPieces));
    });
  }
});

describe('which games really come in fives', () => {
  it('the ones sold both ways keep their bundle', () => {
    for (const id of ['scr_laiko', 'scr_eidiki_x5', 'scr_eidiki_x10']) {
      expect(preset(id).bundleSize).toBe(5);
    }
  });

  it('the ones sold as a single unit have none', () => {
    // Εθνικό's 20 € IS the πεντάδα - one unit, one price, pinned since the
    // day a «five pieces at 4 €» reading turned a real 80 € shift into 16 €.
    for (const id of ['scr_ethniko_x20', 'scr_protochroniatiko']) {
      expect(preset(id).bundleSize).toBe(0);
    }
  });
});
