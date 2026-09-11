import { describe, expect, it } from 'vitest';
import {
  hasBackSide,
  calculateRowQty,
  calculateBackRowQty,
  calculateCombinedRowQty,
  calculateRowTotal,
  ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

// Feature: per-store Scratch Selling Mode (shift_templates.scratch_selling_mode,
// migration 0012). 'FRONT_ONLY' is a hard ceiling that forces every row's back
// side off, overriding any per-row backSideEnabled - distinct from the
// pre-existing scratch_backside_default, which is only a soft per-row default
// a manager can still override (see applyCountingDefaults, covered in
// scratch_bundle.test.ts). The ceiling is threaded as an optional second
// argument so every call site that only ever passes one argument (historical/
// read-only views: ShiftDetailsModal.tsx, ShiftLedgerSheet.tsx) is provably
// unaffected - that is the "historical data integrity" acceptance criterion.

function scratchRow(overrides: Partial<ScratchTicketRow> = {}): ScratchTicketRow {
  return { id: 'scr_5_7ari', name: '7ΑΡΙ', category: 'Σκρατς 5€', price: 5, startNo: '10', endNo: '25', ...overrides };
}

function scratchRowWithBack(overrides: Partial<ScratchTicketRow> = {}): ScratchTicketRow {
  return scratchRow({ backSideEnabled: true, backStartNo: '5', backEndNo: '20', ...overrides });
}

describe('hasBackSide with a store selling-mode ceiling', () => {
  it('FRONT_ONLY forces false regardless of the row\'s own backSideEnabled', () => {
    expect(hasBackSide(scratchRowWithBack(), 'FRONT_ONLY')).toBe(false);
    expect(hasBackSide(scratchRow({ backSideEnabled: true }), 'FRONT_ONLY')).toBe(false);
  });

  it('FRONT_AND_BACK changes nothing - identical to calling with no storeMode at all', () => {
    const row = scratchRowWithBack();
    expect(hasBackSide(row, 'FRONT_AND_BACK')).toBe(hasBackSide(row));
    expect(hasBackSide(row, 'FRONT_AND_BACK')).toBe(true);
  });

  it('no storeMode argument (the historical/read-only display path) ignores store state entirely and derives purely from the row', () => {
    // Simulates ShiftDetailsModal.tsx/ShiftLedgerSheet.tsx, which only ever
    // call these functions with one argument over already-persisted rows -
    // a shift closed under Front+Back before a store switched to Front-only
    // must keep showing its real historical back-side data.
    const closedUnderFrontAndBack = scratchRowWithBack();
    expect(hasBackSide(closedUnderFrontAndBack)).toBe(true);
    expect(calculateBackRowQty(closedUnderFrontAndBack)).toBe(15);
    expect(calculateCombinedRowQty(closedUnderFrontAndBack)).toBe(30);
  });
});

describe('Front-only mode collapses exactly to the pre-bidirectional-tracking (historical front-only) formula', () => {
  it('a row with real back-side numbers still totals as front-only qty x price under the ceiling', () => {
    const row = scratchRowWithBack({ startNo: '10', endNo: '25', backStartNo: '5', backEndNo: '20' });
    // Front-only historical formula for Σκρατς: end < start ? 0 : end - start.
    expect(calculateRowQty(row)).toBe(15);
    expect(calculateBackRowQty(row, 'FRONT_ONLY')).toBe(0);
    expect(calculateCombinedRowQty(row, 'FRONT_ONLY')).toBe(15);
    expect(calculateRowTotal(row, 'FRONT_ONLY')).toBe(15 * 5);
  });

  it('a Λαχεία row under the ceiling matches its own front-only (Math.abs) historical formula, back contribution zeroed', () => {
    const row: ScratchTicketRow = {
      id: 'scr_laxeio', name: 'Λαχείο Χ', category: 'Λαχεία', price: 10,
      startNo: '50', endNo: '30', backSideEnabled: true, backStartNo: '5', backEndNo: '15',
    };
    // Λαχεία front formula allows either direction: Math.abs(start - end).
    expect(calculateRowQty(row)).toBe(20);
    expect(calculateRowTotal(row, 'FRONT_ONLY')).toBe(20 * 10);
  });

  it('a row with no back-side activity at all is unaffected by the ceiling (nothing to zero out)', () => {
    const row = scratchRow({ startNo: '0', endNo: '12' });
    expect(calculateRowTotal(row)).toBe(calculateRowTotal(row, 'FRONT_ONLY'));
  });
});

describe('Front+Back mode is unchanged from today\'s behavior', () => {
  it('explicit FRONT_AND_BACK and the no-argument call produce identical totals for Σκρατς and Λαχεία rows', () => {
    const rows = [
      scratchRowWithBack(),
      { id: 'scr_laxeio', name: 'Λαχείο Χ', category: 'Λαχεία', price: 10, startNo: '50', endNo: '30', backSideEnabled: true, backStartNo: '5', backEndNo: '15' } as ScratchTicketRow,
    ];
    for (const row of rows) {
      expect(calculateRowTotal(row, 'FRONT_AND_BACK')).toBe(calculateRowTotal(row));
      expect(calculateCombinedRowQty(row, 'FRONT_AND_BACK')).toBe(calculateCombinedRowQty(row));
    }
  });
});

describe('Store-specific mode: two stores computing from identical row inputs produce independent totals', () => {
  it('the same catalog totals differently under FRONT_ONLY vs FRONT_AND_BACK', () => {
    const rows = [scratchRowWithBack({ startNo: '0', endNo: '10', backStartNo: '0', backEndNo: '8' })];

    const storeAFrontOnlyTotal = rows.reduce((sum, r) => sum + calculateRowTotal(r, 'FRONT_ONLY'), 0);
    const storeBFrontAndBackTotal = rows.reduce((sum, r) => sum + calculateRowTotal(r, 'FRONT_AND_BACK'), 0);

    expect(storeAFrontOnlyTotal).toBe(10 * 5); // front qty only
    expect(storeBFrontAndBackTotal).toBe((10 + 8) * 5); // front + back
    expect(storeAFrontOnlyTotal).not.toBe(storeBFrontAndBackTotal);
  });
});
