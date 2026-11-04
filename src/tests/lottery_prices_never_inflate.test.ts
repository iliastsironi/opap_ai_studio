import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRATCH_PRESETS,
  applyLotteryProductShapes,
  applyLotteryUnits,
  calculateRowTotal,
  carryOverScratchInventory,
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

// Τι υπήρχε όντως στη βάση την ώρα που γράφτηκε αυτό.
//
// scratch_catalog held the Ειδικές at their πεντάδα price with no πεντάδα
// behind it - 5 € and 10 € in the κομμάτι field - because the rows were
// written before a bundle existed on them. Pinning only on the closing
// screen was not enough: the catalogue is read when a shift OPENS too, and
// those rows are what gets stored and inherited.
describe('a catalogue row saved with the old shape', () => {
  const stale: ScratchTicketRow[] = [
    { id: 'scr_eidiki_x5', name: 'Ειδική Έκδοση χ5', category: 'Λαχεία', price: 5, startNo: '', endNo: '' },
    { id: 'scr_eidiki_x10', name: 'Ειδική Έκδοση χ10', category: 'Λαχεία', price: 10, startNo: '', endNo: '' },
    { id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', price: 10, startNo: '', endNo: '' },
    { id: 'scr_ethniko_x20', name: 'Εθνικό x 20€', category: 'Λαχεία', price: 20, bundleSize: 5, startNo: '', endNo: '' },
  ];

  const shaped = (id: string) => applyLotteryProductShapes(stale).find((r) => r.id === id)!;

  it('βγαίνει στις τιμές του Owner, ό,τι κι αν λέει η γραμμή', () => {
    expect(calculateRowTotal(sold(shaped('scr_eidiki_x5'), 5))).toBe(5);
    expect(calculateRowTotal(sold(shaped('scr_eidiki_x10'), 5))).toBe(10);
    expect(calculateRowTotal(sold(shaped('scr_laiko'), 5))).toBe(10);
    expect(calculateRowTotal(sold(shaped('scr_ethniko_x20'), 1))).toBe(20);
  });

  it('και ένα κομμάτι κοστίζει ένα κομμάτι', () => {
    expect(calculateRowTotal(sold(shaped('scr_eidiki_x5'), 1))).toBe(1);
    expect(calculateRowTotal(sold(shaped('scr_eidiki_x10'), 1))).toBe(2);
    expect(calculateRowTotal(sold(shaped('scr_laiko'), 1))).toBe(2);
  });
});

// Γιατί έπρεπε να καρφωθεί και στο ΑΝΟΙΓΜΑ.
//
// carryOverScratchInventory keeps the previous shift's price over the
// catalogue's, deliberately - an Owner's mid-shift price correction has to
// survive the night. The cost is that one row saved wrong outlives every
// catalogue fix, which is how 5 € a piece with a πεντάδα of five - the 25 €
// the Owner reported - kept coming back shift after shift.
describe('ο,τι κουβαλάει η χθεσινή βάρδια', () => {
  const yesterday: ScratchTicketRow[] = [
    { id: 'scr_eidiki_x5', name: 'Ειδική Έκδοση χ5', category: 'Λαχεία', price: 5, bundleSize: 5, startNo: '100', endNo: '100' },
  ];
  const catalogue: ScratchTicketRow[] = [
    { id: 'scr_eidiki_x5', name: 'Ειδική Έκδοση χ5', category: 'Λαχεία', price: 1, bundleSize: 5, startNo: '', endNo: '' },
  ];

  it('περνάει αυτούσιο χωρίς το κάρφωμα', () => {
    const carried = carryOverScratchInventory(yesterday, catalogue)[0];
    expect(calculateRowTotal(sold(carried, 5))).toBe(25);
  });

  it('με το κάρφωμα, η πεντάδα ξαναγίνεται 5 €', () => {
    const carried = applyLotteryProductShapes(carryOverScratchInventory(yesterday, catalogue))[0];
    expect(calculateRowTotal(sold(carried, 5))).toBe(5);
  });
});
