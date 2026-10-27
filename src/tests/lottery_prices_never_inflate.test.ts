import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRATCH_PRESETS,
  applyLotteryUnits,
  calculateRowTotal,
  type ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

// The real catalogue, so the figures here are the ones a shop is charged.
const preset = (id: string): ScratchTicketRow => {
  const row = DEFAULT_SCRATCH_PRESETS.find((r) => r.id === id);
  if (!row) throw new Error(`no preset ${id}`);
  return { ...row };
};

/** One unit sold off the shelf. */
const soldOne = (row: ScratchTicketRow, pieces = 1): ScratchTicketRow => ({
  ...row,
  startNo: '100',
  endNo: String(100 - pieces),
});

describe('what the till charges for one of each lottery', () => {
  // Reported from the counter: «χρεώνει την ειδική κλήρωση 25 € και το
  // εθνικό λαχείο 100». Both came from inventing a bundle of five on rows
  // that are not sold in fives - the price was multiplied by the unit
  // instead of being labelled by it.
  it('charges a Ειδική Έκδοση χ5 five euro, not twenty-five', () => {
    expect(calculateRowTotal(soldOne(preset('scr_eidiki_x5')))).toBe(5);
  });

  it('charges a Ειδική Έκδοση χ10 ten euro, not fifty', () => {
    expect(calculateRowTotal(soldOne(preset('scr_eidiki_x10')))).toBe(10);
  });

  it('charges a Πρωτοχρονιάτικο five euro', () => {
    expect(calculateRowTotal(soldOne(preset('scr_protochroniatiko')))).toBe(5);
  });

  it('charges a Εθνικό πεντάδα twenty euro, not a hundred', () => {
    expect(calculateRowTotal(soldOne(preset('scr_ethniko_x20')))).toBe(20);
  });

  // The one game that genuinely is five pieces at 2 € each.
  it('charges a Λαϊκό πεντάδα ten euro', () => {
    expect(calculateRowTotal(soldOne(preset('scr_laiko'), 5))).toBe(10);
  });
});

describe('choosing a unit never changes what something costs', () => {
  const lotteries = ['scr_eidiki_x5', 'scr_eidiki_x10', 'scr_protochroniatiko', 'scr_ethniko_x20', 'scr_laiko'];

  for (const id of lotteries) {
    it(`${id} costs the same in πεντάδες as in κομμάτια`, () => {
      const base = soldOne(preset(id), 5);
      const asPieces = applyLotteryUnits([base], { [id]: 'PIECES' })[0];
      const asBundles = applyLotteryUnits([base], { [id]: 'BUNDLES' })[0];
      // Same tickets off the shelf, same money - the unit is a label on the
      // price, never a multiplier.
      expect(calculateRowTotal(asBundles)).toBe(calculateRowTotal(asPieces));
    });
  }

  it('leaves the Λαϊκό its real bundle and takes none from the others', () => {
    const out = applyLotteryUnits(
      lotteries.map((id) => preset(id)),
      Object.fromEntries(lotteries.map((id) => [id, 'BUNDLES']))
    );
    expect(out.find((r) => r.id === 'scr_laiko')!.bundleSize).toBe(5);
    for (const id of ['scr_eidiki_x5', 'scr_eidiki_x10', 'scr_protochroniatiko', 'scr_ethniko_x20']) {
      expect(out.find((r) => r.id === id)!.bundleSize).toBe(0);
    }
  });
});
