import { describe, expect, it } from 'vitest';
import {
  mergeScratchCatalogWithSaved, DEFAULT_SCRATCH_PRESETS,
} from '../components/shifts/ScratchCalculatorTable.tsx';

// The real shape: a game the Owner added to the catalogue, which the night
// counted from 24 to 29 and the next morning showed starting from nothing.
const LEAGUE = 'scr_custom_mvhy9okv';
const leagueCatalogRow = {
  id: LEAGUE, kind: 'SCRATCH', name: 'Σκρατς League', category: 'Σκρατς 5€',
  price: 5, startNo: '', endNo: '', backSideEnabled: true,
} as any;

const catalog = [...DEFAULT_SCRATCH_PRESETS, leagueCatalogRow] as any[];
const night = [
  { id: LEAGUE, name: 'Σκρατς League', category: 'Σκρατς 5€', price: 5, startNo: '24', endNo: '29' },
  { id: 'scr_5_gata', name: 'ΓΑΤΑ', category: 'Σκρατς 5€', price: 5, startNo: '15', endNo: '27' },
] as any[];

const find = (rows: any[]) => rows.find((r) => r.id === LEAGUE);

describe('a catalogue game the shift has no row for', () => {
  // This is the state that produced the report: the shift was created with
  // 21 rows and the closing screen added the 22nd from the catalogue.
  const shiftRows = [
    { id: 'scr_5_gata', name: 'ΓΑΤΑ', category: 'Σκρατς 5€', price: 5, startNo: '27', endNo: '29' },
  ] as any[];

  it('used to arrive with nothing in it', () => {
    const merged = mergeScratchCatalogWithSaved(catalog, shiftRows);
    expect(find(merged).startNo).toBe('');
  });

  it('now opens where the previous shift left it', () => {
    const merged = mergeScratchCatalogWithSaved(catalog, shiftRows, night);
    expect(find(merged).startNo).toBe('29');
  });

  it('takes the opening when the night never touched the pack', () => {
    const untouched = [{ id: LEAGUE, name: 'Σκρατς League', category: 'Σκρατς 5€', startNo: '24', endNo: '' }] as any[];
    expect(find(mergeScratchCatalogWithSaved(catalog, shiftRows, untouched)).startNo).toBe('24');
  });

  it('matches on name and category when the id has changed', () => {
    const renamedId = [{ id: 'scr_custom_other', name: 'Σκρατς League', category: 'Σκρατς 5€', startNo: '24', endNo: '29' }] as any[];
    expect(find(mergeScratchCatalogWithSaved(catalog, shiftRows, renamedId)).startNo).toBe('29');
  });

  it('stays blank for a game nobody has ever counted', () => {
    // Inventing a position would be worse than showing none.
    expect(find(mergeScratchCatalogWithSaved(catalog, shiftRows, [])).startNo).toBe('');
    expect(find(mergeScratchCatalogWithSaved(catalog, shiftRows, null)).startNo).toBe('');
  });

  it('seeds it even when the shift has no rows at all', () => {
    expect(find(mergeScratchCatalogWithSaved(catalog, [], night)).startNo).toBe('29');
  });
});

describe('what it must not disturb', () => {
  it('leaves a game the shift IS counting exactly as it is', () => {
    const shiftRows = [
      { id: LEAGUE, name: 'Σκρατς League', category: 'Σκρατς 5€', price: 5, startNo: '29', endNo: '33' },
    ] as any[];
    const merged = mergeScratchCatalogWithSaved(catalog, shiftRows, night);
    expect(find(merged).startNo).toBe('29');
    expect(find(merged).endNo).toBe('33');
  });

  it('does not overwrite a start the operator has corrected', () => {
    const corrected = [
      { id: LEAGUE, name: 'Σκρατς League', category: 'Σκρατς 5€', price: 5, startNo: '31', endNo: '' },
    ] as any[];
    expect(find(mergeScratchCatalogWithSaved(catalog, corrected, night)).startNo).toBe('31');
  });
});

describe('a shift already created without the game', () => {
  // Its row exists by now - the closing screen added a blank one - so the
  // merge finds a match and there is nothing to «add». It still has to be
  // filled, or the fix would help only shifts opened after it.
  const blankRow = [
    { id: LEAGUE, name: 'Σκρατς League', category: 'Σκρατς 5€', price: 5, startNo: '', endNo: '' },
  ] as any[];

  it('fills the blank αρχικό from the night’s declaration', () => {
    expect(find(mergeScratchCatalogWithSaved(catalog, blankRow, night)).startNo).toBe('29');
  });

  it('leaves it blank when there is nothing to fill it from', () => {
    expect(find(mergeScratchCatalogWithSaved(catalog, blankRow, [])).startNo).toBe('');
  });

  it('never overwrites a figure the operator has typed', () => {
    const typed = [{ ...blankRow[0], startNo: '31' }] as any[];
    expect(find(mergeScratchCatalogWithSaved(catalog, typed, night)).startNo).toBe('31');
  });

  it('does not touch a zero the operator meant', () => {
    // '0' is a real position - a fresh pack - and must survive.
    const zero = [{ ...blankRow[0], startNo: '0' }] as any[];
    expect(find(mergeScratchCatalogWithSaved(catalog, zero, night)).startNo).toBe('0');
  });
});

describe('a position of zero', () => {
  it('survives as a number, not just as a string', () => {
    // A pack opened at its first ticket. Falsiness would read 0 as «missing»
    // and overwrite it with the previous shift's 29.
    const zero = [
      { id: LEAGUE, name: 'Σκρατς League', category: 'Σκρατς 5€', price: 5, startNo: 0, endNo: '' },
    ] as any[];
    expect(find(mergeScratchCatalogWithSaved(catalog, zero, night)).startNo).toBe(0);
  });

  it('is inherited from a night that ended at zero', () => {
    const endedAtZero = [
      { id: LEAGUE, name: 'Σκρατς League', category: 'Σκρατς 5€', startNo: '5', endNo: 0 },
    ] as any[];
    const blank = [{ id: LEAGUE, name: 'Σκρατς League', category: 'Σκρατς 5€', startNo: '', endNo: '' }] as any[];
    expect(find(mergeScratchCatalogWithSaved(catalog, blank, endedAtZero)).startNo).toBe('0');
  });
});
