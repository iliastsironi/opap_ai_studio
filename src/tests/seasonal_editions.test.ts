import { describe, expect, it } from 'vitest';
import {
  SEASONAL_DEFAULT_BUNDLE_SIZE,
  SEASONAL_EDITIONS,
  hiddenSeasonalRowIds,
  isSeasonalEditionEnabled,
  isSeasonalEditionRow,
  seasonalBundleSizeFor,
  seasonalEditionFor,
} from '../lib/seasonalEditions.ts';

describe('each seasonal edition stands on its own', () => {
  it('knows the three of them', () => {
    expect(SEASONAL_EDITIONS.map((e) => e.rowId)).toEqual([
      'scr_eidiki_x5',
      'scr_eidiki_x10',
      'scr_protochroniatiko',
    ]);
  });

  it('shows only the one that is switched on', () => {
    const cfg = { protochroniatiko_enabled: true };
    expect(isSeasonalEditionEnabled('scr_protochroniatiko', cfg)).toBe(true);
    expect(isSeasonalEditionEnabled('scr_eidiki_x5', cfg)).toBe(false);
    expect(isSeasonalEditionEnabled('scr_eidiki_x10', cfg)).toBe(false);
    expect(hiddenSeasonalRowIds(cfg)).toEqual(['scr_eidiki_x5', 'scr_eidiki_x10']);
  });

  it('can have two on and one off', () => {
    const cfg = { special_edition_x5_enabled: true, special_edition_x10_enabled: true };
    expect(hiddenSeasonalRowIds(cfg)).toEqual(['scr_protochroniatiko']);
  });

  it('hides all three when nothing is set anywhere', () => {
    expect(hiddenSeasonalRowIds({})).toHaveLength(3);
    expect(hiddenSeasonalRowIds(null)).toHaveLength(3);
  });
});

// A store configured before the switches were split must keep seeing exactly
// what it saw. The old single switch is the fallback, never the override.
describe('a store configured before the split', () => {
  it('keeps all three visible if the old switch was on', () => {
    expect(hiddenSeasonalRowIds({ special_edition_enabled: true })).toEqual([]);
  });

  it('keeps all three hidden if the old switch was off', () => {
    expect(hiddenSeasonalRowIds({ special_edition_enabled: false })).toHaveLength(3);
  });

  it('lets a new per-edition switch override the old one, either way', () => {
    const cfg = { special_edition_enabled: true, protochroniatiko_enabled: false };
    expect(isSeasonalEditionEnabled('scr_protochroniatiko', cfg)).toBe(false);
    expect(isSeasonalEditionEnabled('scr_eidiki_x5', cfg)).toBe(true);

    const cfg2 = { special_edition_enabled: false, special_edition_x5_enabled: true };
    expect(isSeasonalEditionEnabled('scr_eidiki_x5', cfg2)).toBe(true);
    expect(isSeasonalEditionEnabled('scr_eidiki_x10', cfg2)).toBe(false);
  });
});

describe('rows that are not seasonal', () => {
  it('are not governed by this rule at all', () => {
    expect(isSeasonalEditionRow('scr_laiko')).toBe(false);
    expect(isSeasonalEditionEnabled('scr_laiko', {})).toBe(true);
    expect(isSeasonalEditionEnabled('scr_ethniko_x20', null)).toBe(true);
  });

  it('are not found in the registry', () => {
    expect(seasonalEditionFor('scr_laiko')).toBeUndefined();
    expect(seasonalEditionFor(undefined)).toBeUndefined();
  });
});

describe('how a seasonal edition is counted', () => {
  it('starts in πεντάδες', () => {
    expect(SEASONAL_DEFAULT_BUNDLE_SIZE).toBe(5);
  });
});

describe('how each edition is counted, set once in Διαμόρφωση', () => {
  it('counts in πεντάδες when the shop has not said otherwise', () => {
    for (const e of SEASONAL_EDITIONS) {
      expect(seasonalBundleSizeFor(e.rowId, {})).toBe(5);
      expect(seasonalBundleSizeFor(e.rowId, null)).toBe(5);
    }
  });

  it('counts one edition in pieces without touching the others', () => {
    const cfg = { special_edition_x10_bundles: false };
    expect(seasonalBundleSizeFor('scr_eidiki_x10', cfg)).toBe(0);
    expect(seasonalBundleSizeFor('scr_eidiki_x5', cfg)).toBe(5);
    expect(seasonalBundleSizeFor('scr_protochroniatiko', cfg)).toBe(5);
  });

  it('reads an explicit true as πεντάδες', () => {
    expect(seasonalBundleSizeFor('scr_eidiki_x5', { special_edition_x5_bundles: true })).toBe(5);
  });

  // Only an explicit false switches to pieces: anything else - a column that
  // does not exist yet, a null from a row written before the migration - is
  // the default, not «pieces».
  it('treats anything other than false as πεντάδες', () => {
    for (const v of [undefined, null, 0, '', 'false']) {
      expect(seasonalBundleSizeFor('scr_eidiki_x5', { special_edition_x5_bundles: v })).toBe(5);
    }
  });

  it('has nothing to say about a row that is not seasonal', () => {
    expect(seasonalBundleSizeFor('scr_laiko', { special_edition_x5_bundles: false })).toBe(5);
  });
});
