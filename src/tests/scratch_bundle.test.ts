import { describe, expect, it } from 'vitest';
import {
  isBundleTrackedRow,
  isLotteryRow,
  hasBackSide,
  parseNonNegativeInt,
  normalizeBundleEntry,
  splitPiecesIntoBundles,
  validateBundleSaleEntry,
  calculateRowTotal,
  ScratchTicketRow,
} from '../components/shifts/ScratchCalculatorTable.tsx';

// Covers the Λαϊκό Λαχείο dual-unit (πεντάδες/κομμάτια) acceptance criteria.
// The permission side (Admin can change the initial total, a regular User
// cannot - neither via UI nor a direct API request) is verified live against
// the real database in supabase/scripts/test-laiko-bundle.mjs, since that
// requires real auth sessions and RLS/trigger enforcement a unit test can't
// exercise. No legacy migration test exists here because the live data was
// verified (before this feature was built) to already store the Λαϊκό
// Λαχείο "ένδειξη" as a remaining-piece count, never as bundles - there was
// nothing to convert.

function laikoRow(overrides: Partial<ScratchTicketRow> = {}): ScratchTicketRow {
  return {
    // price is PER PIECE (€2) - a full πεντάδα (bundleSize=5) costs €10,
    // matching the real product (5 x €2 = €10).
    id: 'scr_laiko', name: 'Λαϊκό Λαχείο', category: 'Λαχεία', price: 2, bundleSize: 5,
    startNo: '100', endNo: '', saleBundles: '', salePieces: '',
    ...overrides,
  };
}

describe('Λαϊκό Λαχείο bundle/piece dual-unit tracking', () => {
  it('identifies bundle-tracked rows only when bundleSize is present and positive', () => {
    expect(isBundleTrackedRow(laikoRow())).toBe(true);
    expect(isBundleTrackedRow(laikoRow({ bundleSize: 0 }))).toBe(false);
    expect(isBundleTrackedRow(laikoRow({ bundleSize: undefined }))).toBe(false);
    expect(isBundleTrackedRow({ id: 'scr_1_seria', name: 'X', category: 'Σκρατς', price: 1, startNo: '', endNo: '' })).toBe(false);
  });

  describe('parseNonNegativeInt', () => {
    it('accepts non-negative integers, including zero', () => {
      expect(parseNonNegativeInt('0')).toEqual({ value: 0, isValid: true });
      expect(parseNonNegativeInt('7')).toEqual({ value: 7, isValid: true });
      expect(parseNonNegativeInt('103')).toEqual({ value: 103, isValid: true });
    });

    it('treats empty as zero (no entry yet), not an error', () => {
      expect(parseNonNegativeInt('')).toEqual({ value: 0, isValid: true });
      expect(parseNonNegativeInt(undefined)).toEqual({ value: 0, isValid: true });
    });

    it('rejects decimals, negatives, and non-numeric text', () => {
      expect(parseNonNegativeInt('2.5').isValid).toBe(false);
      expect(parseNonNegativeInt('-1').isValid).toBe(false);
      expect(parseNonNegativeInt('abc').isValid).toBe(false);
      expect(parseNonNegativeInt('1e3').isValid).toBe(false);
    });
  });

  describe('normalizeBundleEntry (auto-normalization, pieces always end up in [0, bundleSize-1])', () => {
    it('leaves an already-normalized entry unchanged', () => {
      expect(normalizeBundleEntry(2, 3, 5)).toEqual({ bundles: 2, pieces: 3 });
    });

    it('normalizes 7 individual pieces into 1 bundle + 2 pieces', () => {
      expect(normalizeBundleEntry(0, 7, 5)).toEqual({ bundles: 1, pieces: 2 });
    });

    it('normalizes 1 bundle + 7 pieces into 2 bundles + 2 pieces', () => {
      expect(normalizeBundleEntry(1, 7, 5)).toEqual({ bundles: 2, pieces: 2 });
    });

    it('accepts just 1 individual piece with no bundles', () => {
      expect(normalizeBundleEntry(0, 1, 5)).toEqual({ bundles: 0, pieces: 1 });
    });
  });

  describe('splitPiecesIntoBundles (derived, informational display only)', () => {
    it('100 pieces displays as 20 bundles + 0', () => {
      expect(splitPiecesIntoBundles(100, 5)).toEqual({ bundles: 20, pieces: 0 });
    });

    it('103 pieces displays as 20 bundles + 3 (the stored value itself stays 103)', () => {
      expect(splitPiecesIntoBundles(103, 5)).toEqual({ bundles: 20, pieces: 3 });
    });

    it('87 pieces displays as 17 bundles + 2', () => {
      expect(splitPiecesIntoBundles(87, 5)).toEqual({ bundles: 17, pieces: 2 });
    });
  });

  describe('validateBundleSaleEntry (the sale being recorded against available stock)', () => {
    it('2 bundles + 3 pieces = 13 sold, valid against a 100-piece stock', () => {
      const result = validateBundleSaleEntry(laikoRow({ saleBundles: '2', salePieces: '3' }));
      expect(result).toMatchObject({ isValid: true, soldPieces: 13, errors: [] });
    });

    it('selling 13 from a 100-piece stock leaves 87 (17 bundles + 2 pieces)', () => {
      const result = validateBundleSaleEntry(laikoRow({ saleBundles: '2', salePieces: '3' }));
      const remaining = 100 - result.soldPieces;
      expect(remaining).toBe(87);
      expect(splitPiecesIntoBundles(remaining, 5)).toEqual({ bundles: 17, pieces: 2 });
    });

    it('accepts just 1 individual piece with no bundles', () => {
      const result = validateBundleSaleEntry(laikoRow({ saleBundles: '0', salePieces: '1' }));
      expect(result).toMatchObject({ isValid: true, soldPieces: 1 });
    });

    it('rejects a sale exceeding available stock, with no fabricated partial result', () => {
      const result = validateBundleSaleEntry(laikoRow({ startNo: '10', saleBundles: '3', salePieces: '0' }));
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toMatch(/ξεπερνά το διαθέσιμο απόθεμα/);
    });

    it('rejects negative or decimal sale fields with a clear Greek error', () => {
      const negative = validateBundleSaleEntry(laikoRow({ saleBundles: '-1', salePieces: '0' }));
      expect(negative.isValid).toBe(false);
      expect(negative.errors[0]).toMatch(/Πεντάδες/);

      const decimal = validateBundleSaleEntry(laikoRow({ saleBundles: '1', salePieces: '2.5' }));
      expect(decimal.isValid).toBe(false);
      expect(decimal.errors[0]).toMatch(/Κομμάτια/);
    });

    it('re-validates correctly after an edit changes the recorded sale (no stale totals)', () => {
      const original = validateBundleSaleEntry(laikoRow({ saleBundles: '2', salePieces: '3' }));
      expect(original.soldPieces).toBe(13);

      const edited = validateBundleSaleEntry(laikoRow({ saleBundles: '1', salePieces: '0' }));
      expect(edited).toMatchObject({ isValid: true, soldPieces: 5 });
    });

    it('a sale entered and then cleared (stored as "0"/"0" strings, not undefined) computes the same soldPieces as a never-touched row', () => {
      // handleUpdateBundleSale always writes String(normBundles)/String(normPieces),
      // so clearing an input leaves "0" (a non-empty, truthy string), never "".
      // The UI's own > 0 check (not a truthy-string check) is what makes this
      // display identically to a fresh row - this pins the soldPieces side of
      // that invariant.
      const cleared = validateBundleSaleEntry(laikoRow({ saleBundles: '0', salePieces: '0' }));
      const neverTouched = validateBundleSaleEntry(laikoRow({ saleBundles: undefined, salePieces: undefined }));
      expect(cleared.soldPieces).toBe(0);
      expect(neverTouched.soldPieces).toBe(0);
      expect(cleared.soldPieces).toBe(neverTouched.soldPieces);
    });
  });

  describe('price is per piece for bundle-tracked rows (bundle price is derived: price x bundleSize)', () => {
    it('a full πεντάδα (5 pieces) at €2/piece totals €10, matching the real product', () => {
      const row = laikoRow({ saleBundles: '1', salePieces: '0', endNo: '95' });
      expect(calculateRowTotal(row)).toBe(10);
    });

    it('13 pieces (2 bundles + 3) at €2/piece totals €26, not €130', () => {
      const row = laikoRow({ saleBundles: '2', salePieces: '3', endNo: '87' });
      expect(calculateRowTotal(row)).toBe(26);
    });
  });

  describe('hasBackSide (Πίσω selling) - independent of bundle-tracking, opt-in per row', () => {
    it('defaults to false for Λαχεία and true for Σκρατς, matching pre-existing behavior', () => {
      const scratchRow: ScratchTicketRow = { id: 'scr_5_7ari', name: '7ΑΡΙ', category: 'Σκρατς 5€', price: 5, startNo: '', endNo: '' };
      expect(isLotteryRow(laikoRow())).toBe(true);
      expect(hasBackSide(laikoRow())).toBe(false);
      expect(isLotteryRow(scratchRow)).toBe(false);
      expect(hasBackSide(scratchRow)).toBe(true);
    });

    it('an explicit backSideEnabled overrides the category default either way', () => {
      expect(hasBackSide(laikoRow({ backSideEnabled: true }))).toBe(true);
      const scratchRow: ScratchTicketRow = { id: 'scr_5_7ari', name: '7ΑΡΙ', category: 'Σκρατς 5€', price: 5, startNo: '', endNo: '', backSideEnabled: false };
      expect(hasBackSide(scratchRow)).toBe(false);
    });
  });
});
