import { describe, expect, it } from 'vitest';
import {
  bundleSizeForUnit,
  isBundlesOnly,
  normalizeLotteryUnit,
  unitFor,
  withUnit,
} from '../lib/lotteryUnits.ts';

describe('the shop’s own answer wins', () => {
  it('reads the map first', () => {
    expect(unitFor('scr_eidiki_x5', { scr_eidiki_x5: 'PIECES' })).toBe('PIECES');
    expect(unitFor('scr_laiko', { scr_laiko: 'BUNDLES' }, { laiko_selling_mode: 'PIECES_AND_BUNDLES' }))
      .toBe('BUNDLES');
  });

  it('ignores a value that is not a unit', () => {
    expect(unitFor('scr_eidiki_x5', { scr_eidiki_x5: 'ΟΥΠΣ' }, { special_edition_x5_bundles: false }))
      .toBe('PIECES');
    expect(normalizeLotteryUnit(true)).toBeNull();
  });
});

// A shop that has never opened the new screen must keep exactly what it had.
describe('falling back to the settings this replaces', () => {
  it('reads the old per-edition booleans', () => {
    const legacy = { special_edition_x5_bundles: true, special_edition_x10_bundles: false };
    expect(unitFor('scr_eidiki_x5', {}, legacy)).toBe('BUNDLES');
    expect(unitFor('scr_eidiki_x10', {}, legacy)).toBe('PIECES');
  });

  it('keeps Λαϊκό on its three-way setting', () => {
    expect(unitFor('scr_laiko', {}, { laiko_selling_mode: 'BUNDLES_ONLY' })).toBe('BUNDLES');
    expect(unitFor('scr_laiko', {}, { laiko_selling_mode: 'PIECES_AND_BUNDLES' })).toBe('DUAL');
    expect(unitFor('scr_laiko', {}, {})).toBe('DUAL');
  });

  it('falls back to how the game is packaged when nothing else says', () => {
    expect(unitFor('scr_ethniko_x20', {}, {}, 0)).toBe('PIECES');
    expect(unitFor('scr_kati_kainourio', null, null, 5)).toBe('BUNDLES');
    expect(unitFor('scr_kati_kainourio', null, null, undefined)).toBe('PIECES');
  });
});

describe('what a unit means on the row', () => {
  it('turns πεντάδες into a bundle size and κομμάτια into zero', () => {
    expect(bundleSizeForUnit('BUNDLES')).toBe(5);
    expect(bundleSizeForUnit('DUAL')).toBe(5);
    expect(bundleSizeForUnit('PIECES')).toBe(0);
  });

  it('respects a game packaged in something other than fives', () => {
    expect(bundleSizeForUnit('BUNDLES', 10)).toBe(10);
    expect(bundleSizeForUnit('PIECES', 10)).toBe(0);
    expect(bundleSizeForUnit('BUNDLES', 'ουπς')).toBe(5);
  });

  it('is one column only for πεντάδες', () => {
    expect(isBundlesOnly('BUNDLES')).toBe(true);
    expect(isBundlesOnly('DUAL')).toBe(false);
    expect(isBundlesOnly('PIECES')).toBe(false);
  });
});

describe('changing one lottery', () => {
  it('leaves the others alone', () => {
    const next = withUnit({ scr_laiko: 'DUAL', scr_eidiki_x5: 'BUNDLES' }, 'scr_eidiki_x5', 'PIECES');
    expect(next).toEqual({ scr_laiko: 'DUAL', scr_eidiki_x5: 'PIECES' });
  });

  it('drops rubbish already in the map rather than carrying it forward', () => {
    expect(withUnit({ bad: 'ΟΥΠΣ' }, 'scr_laiko', 'BUNDLES')).toEqual({ scr_laiko: 'BUNDLES' });
  });

  it('starts a map that did not exist', () => {
    expect(withUnit(null, 'scr_laiko', 'PIECES')).toEqual({ scr_laiko: 'PIECES' });
  });
});
