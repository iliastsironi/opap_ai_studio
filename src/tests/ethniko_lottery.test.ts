import { describe, expect, it } from 'vitest';
import {
  applyEthnikoShape, isEthnikoRow, lotteryUnitLabel, canToggleBundleTracking,
  ETHNIKO_ROW_ID, ETHNIKO_BUNDLE_PRICE,
} from '../lib/ethnikoLottery.ts';

const ethniko = (over: Record<string, unknown> = {}) => ({
  id: ETHNIKO_ROW_ID, name: 'Εθνικό x 20€', category: 'Λαχεία',
  price: 20, startNo: '47', endNo: '', ...over,
}) as any;

describe('the shape is pinned, whatever the row arrived as', () => {
  it('counts one πεντάδα at 20 €', () => {
    const [row] = applyEthnikoShape([ethniko()]);
    expect(row.price).toBe(20);
    expect(row.bundleSize).toBe(0);
  });

  it('undoes the five-piece spell', () => {
    // What lottery_bundle_default: true produced - 20 € a piece, 100 € a πεντάδα.
    const [row] = applyEthnikoShape([ethniko({ bundleSize: 5 })]);
    expect(row.bundleSize).toBe(0);
    expect(row.price).toBe(ETHNIKO_BUNDLE_PRICE);
  });

  it('clears dual-entry figures left behind by it', () => {
    const [row] = applyEthnikoShape([ethniko({ bundleSize: 5, saleBundles: '3', salePieces: '2' })]);
    expect(row.saleBundles).toBe('');
    expect(row.salePieces).toBe('');
  });

  it('fixes a price somebody had edited away', () => {
    const [row] = applyEthnikoShape([ethniko({ price: 4 })]);
    expect(row.price).toBe(20);
  });

  it('does not check whether it is already set', () => {
    // A stale 0 from a cached catalogue would otherwise stay forever, which
    // is the fault being fixed.
    const [row] = applyEthnikoShape([ethniko({ bundleSize: 0, price: 100 })]);
    expect(row.price).toBe(20);
  });

  it('leaves every other game alone', () => {
    const rows = [
      { id: 'scr_laiko', price: 2, bundleSize: 5 },
      { id: 'scr_5_gata', price: 5 },
    ] as any[];
    expect(applyEthnikoShape(rows)).toEqual(rows);
  });
});

describe('the money already on record', () => {
  it('still reads 80 € for 53 → 49', () => {
    // A real August shift at store_101499. Four πεντάδες, not four pieces:
    // modelling this as 4 €/piece with bundles of five would make it 16 €.
    const [row] = applyEthnikoShape([ethniko({ startNo: '53', endNo: '49' })]);
    const sold = Number(row.startNo) - Number(row.endNo);
    expect(sold).toBe(4);
    expect(sold * Number(row.price)).toBe(80);
  });

  it('reads 20 € for one πεντάδα', () => {
    const [row] = applyEthnikoShape([ethniko({ startNo: '48', endNo: '47' })]);
    expect((Number(row.startNo) - Number(row.endNo)) * Number(row.price)).toBe(20);
  });
});

describe('how it is presented', () => {
  it('calls the unit a πεντάδα, not a κομμάτι', () => {
    expect(lotteryUnitLabel(ethniko())).toBe('πεντάδα');
    expect(lotteryUnitLabel({ id: 'scr_laiko' })).toBeNull();
  });

  it('offers no πεντάδες + κομμάτια toggle, so it cannot drift again', () => {
    expect(canToggleBundleTracking(ethniko())).toBe(false);
    expect(canToggleBundleTracking({ id: 'scr_laiko' })).toBe(true);
  });

  it('recognises the row and nothing else', () => {
    expect(isEthnikoRow(ethniko())).toBe(true);
    expect(isEthnikoRow({ id: 'scr_eidiki_x10' })).toBe(false);
    expect(isEthnikoRow(null)).toBe(false);
  });
});

describe('the Greek', () => {
  it('pluralises the unit properly', async () => {
    const { lotteryUnitLabelPlural } = await import('../lib/ethnikoLottery.ts');
    // «πεντάδα» + «ες» is not a word.
    expect(lotteryUnitLabelPlural(ethniko())).toBe('πεντάδες');
    expect(lotteryUnitLabelPlural({ id: 'scr_laiko' })).toBeNull();
  });
});
